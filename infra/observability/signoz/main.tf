terraform {
  required_version = ">= 1.9, < 2.0"
  required_providers {
    signoz = {
      source  = "SigNoz/signoz"
      version = "0.1.4"
    }
  }
}

# Credentials come only from SIGNOZ_ACCESS_TOKEN; endpoint from SIGNOZ_ENDPOINT.
provider "signoz" {}

variable "environment" {
  type    = string
  default = "staging"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Choose staging or production."
  }
}

variable "enable_alerts" {
  type    = bool
  default = false
}

variable "notification_channels" {
  type        = list(string)
  default     = []
  description = "Existing reviewed channel names; this module never creates destinations."
}

locals {
  environment_filter = "deployment.environment.name = '${var.environment}'"
  rules = {
    root_disk = {
      title  = "Root filesystem below release headroom", metric = "system.filesystem.usage",
      filter = "mountpoint = '/' AND state = 'free'", target = 2147483648,
      op     = "below", window = "5m", group = "mountpoint", severity = "critical"
    }
    image_disk = {
      title  = "Image storage below release headroom", metric = "system.filesystem.usage",
      filter = "mountpoint IN ('/var/lib/docker', '/var/lib/containerd') AND state = 'free'", target = 10737418240,
      op     = "below", window = "5m", group = "mountpoint", severity = "critical"
    }
    inodes = {
      title  = "Filesystem below release inode headroom", metric = "system.filesystem.inodes.usage",
      filter = "mountpoint IN ('/', '/var/lib/docker', '/var/lib/containerd') AND state = 'free'", target = 100000,
      op     = "below", window = "5m", group = "mountpoint", severity = "critical"
    }
    container_memory = {
      title  = "Container memory approaching limit", metric = "container.memory.percent",
      filter = "docker.stack.name = 'tickif'", target = 85,
      op     = "above", window = "10m", group = "docker.service.name", severity = "warning"
    }
    health_probe = {
      title  = "Private service health probe failing", metric = "httpcheck.status",
      filter = "http.status_class = '2xx'", target = 1,
      op     = "below", window = "2m", group = "http.url", severity = "critical"
    }
  }
  panels = {
    cpu             = { title = "Host CPU utilization by state", metric = "system.cpu.utilization", filter = "", group = "state", unit = "percentunit" }
    memory          = { title = "Host used memory utilization", metric = "system.memory.utilization", filter = "state = 'used'", group = "host.name", unit = "percentunit" }
    filesystem      = { title = "Free filesystem bytes", metric = "system.filesystem.usage", filter = "state = 'free'", group = "mountpoint", unit = "By" }
    inodes          = { title = "Free filesystem inodes", metric = "system.filesystem.inodes.usage", filter = "state = 'free'", group = "mountpoint", unit = "1" }
    containers      = { title = "Container memory (% of limit)", metric = "container.memory.percent", filter = "docker.stack.name = 'tickif'", group = "docker.service.name", unit = "%" }
    health          = { title = "Private health probes (2xx)", metric = "httpcheck.status", filter = "http.status_class = '2xx'", group = "http.url", unit = "1" }
    queue           = { title = "Collector queued bytes", metric = "otelcol_exporter_queue_size", filter = "", group = "exporter", unit = "By" }
    api_requests    = { title = "API requests per second", metric = "http.server.requests", filter = "service.name = 'tickif-api'", group = "http.route", unit = "reqps", temporal = "rate", spatial = "sum" }
    api_latency     = { title = "API request p95 seconds", metric = "http.server.request.duration.bucket", filter = "service.name = 'tickif-api'", group = "http.route", unit = "s", temporal = "rate", spatial = "p95" }
    worker_failures = { title = "Worker terminal failures per second", metric = "tickif.worker.job.transitions", filter = "outcome = 'terminal'", group = "queue", unit = "ops", temporal = "rate", spatial = "sum" }
    queue_waiting   = { title = "Waiting jobs (one designated exporter)", metric = "tickif.queue.jobs", filter = "state = 'waiting'", group = "queue", unit = "1" }
    queue_head_age  = { title = "Queue head creation age seconds", metric = "tickif.queue.next_waiting_job_age", filter = "", group = "queue", unit = "s" }
  }
}

resource "signoz_rule" "infrastructure" {
  for_each       = local.rules
  alert          = "Tickif ${var.environment}: ${each.value.title}"
  alert_type     = "METRIC_BASED_ALERT"
  rule_type      = "threshold_rule"
  schema_version = "v2alpha1"
  disabled       = !var.enable_alerts
  description    = "Initial threshold. Check the observability runbook and verify live units before enabling."
  labels         = { environment = var.environment, service_namespace = "tickif", severity = each.value.severity }
  annotations    = { summary = each.value.title, runbook = "docs/runbooks/observability.md" }
  condition = {
    selected_query_name = "A"
    composite_query = {
      panel_type = "graph"
      query_type = "builder"
      queries = [{
        builder_query = {
          type = "builder_query"
          spec = {
            metrics = {
              name         = "A", signal = "metrics", step_interval = "30"
              aggregations = [{ metric_name = each.value.metric, space_aggregation = "max", time_aggregation = "avg" }]
              filter       = { expression = "${local.environment_filter} AND ${each.value.filter}" }
              group_by     = [{ name = each.value.group, field_context = "attribute", field_data_type = "string" }]
            }
          }
        }
      }]
    }
    thresholds = {
      basic = {
        kind = "basic"
        spec = [{ name = each.value.severity, op = each.value.op, target = each.value.target, match_type = "all_the_times", channels = var.notification_channels }]
      }
    }
  }
  evaluation            = { rolling = { kind = "rolling", spec = { eval_window = each.value.window, frequency = "1m" } } }
  notification_settings = {}
}

resource "signoz_dashboard" "infrastructure" {
  schema_version = "v6"
  name           = "tickif-${var.environment}-infrastructure"
  tags           = [{ key = "environment", value = var.environment }, { key = "managed-by", value = "terraform" }]
  spec = {
    variables = []
    display   = { name = "Tickif ${var.environment}: infrastructure", description = "Host, container, private health and collection signals. Missing panels require investigation, not a zero-value assumption." }
    panels = {
      for name, panel in local.panels : name => {
        kind = "Panel"
        spec = {
          display = { name = panel.title }
          plugin = {
            time_series_panel = {
              kind = "signoz/TimeSeriesPanel"
              spec = { visualization = { time_preference = "global_time" }, formatting = { unit = panel.unit, decimal_precision = "2" } }
            }
          }
          queries = [{
            kind = "time_series"
            spec = {
              name = "A"
              plugin = {
                builder_query = {
                  kind = "signoz/BuilderQuery"
                  spec = {
                    metrics = {
                      name         = "A", signal = "metrics", step_interval = "30"
                      aggregations = [{ metric_name = panel.metric, space_aggregation = try(panel.spatial, "max"), time_aggregation = try(panel.temporal, "avg") }]
                      filter       = { expression = panel.filter == "" ? local.environment_filter : "${local.environment_filter} AND ${panel.filter}" }
                      group_by     = [{ name = panel.group, field_context = "attribute", field_data_type = "string" }]
                      legend       = panel.title
                    }
                  }
                }
              }
            }
          }]
        }
      }
    }
    layouts = [{
      grid = {
        kind = "Grid"
        spec = {
          display = { title = "Infrastructure", collapse = { open = true } }
          items = [for index, name in sort(keys(local.panels)) : {
            x       = (index % 2) * 6, y = floor(index / 2) * 6, width = 6, height = 6
            content = { ref = "#/spec/panels/${name}" }
          }]
        }
      }
    }]
  }
}
