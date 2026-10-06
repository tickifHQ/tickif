# PromQL reads cumulative metrics. Keep the shared SDK's cumulative temporality;
# changing to delta requires rewriting these rules before rollout.
locals {
  env_selector = "\"deployment.environment.name\"=\"${var.environment}\""
  api_selector = "${local.env_selector},\"service.name\"=\"tickif-api\",\"http.route\"!~\"/(health|livez|readyz)\""
  api_total    = "sum(increase({\"http.server.requests\",${local.api_selector}}[5m]))"
  api_errors   = "sum(increase({\"http.server.requests\",${local.api_selector},\"http.response.status_code\"=~\"5..\"}[5m]))"
  operational_rules = {
    host_cpu = {
      title  = "Host CPU busy above 85%"
      query  = "1 - avg({\"system.cpu.utilization\",${local.env_selector},state=\"idle\"})"
      target = 0.85, window = "15m", match = "all_the_times", severity = "warning"
    }
    host_memory = {
      title  = "Host memory used above 90%"
      query  = "max({\"system.memory.utilization\",${local.env_selector},state=\"used\"})"
      target = 0.9, window = "10m", match = "all_the_times", severity = "warning"
    }
    worker_domain_rejections = {
      title  = "Worker terminal domain rejection"
      query  = "sum by (queue) (increase({\"tickif.worker.domain.rejections\",${local.env_selector}}[5m]))"
      target = 0, window = "5m", match = "at_least_once", severity = "warning"
    }
    api_error_ratio = {
      title  = "API errors above 5% with traffic guard"
      query  = "(${local.api_errors} / clamp_min(${local.api_total}, 1) * 100) and (${local.api_total} >= 100) and (${local.api_errors} >= 5)"
      target = 5, window = "5m", match = "all_the_times", severity = "critical"
    }
    api_latency = {
      title  = "API p95 above one second with traffic guard"
      query  = "histogram_quantile(0.95, sum by (le) (rate({\"http.server.request.duration.bucket\",${local.api_selector}}[5m]))) and (${local.api_total} >= 100)"
      target = 1, window = "10m", match = "all_the_times", severity = "warning"
    }
    worker_terminal = {
      title  = "Worker retry exhaustion"
      query  = "sum by (queue) (increase({\"tickif.worker.job.transitions\",${local.env_selector},outcome=\"terminal\"}[5m]))"
      target = 0, window = "5m", match = "at_least_once", severity = "critical"
    }
    worker_backlog = {
      title  = "Queue waiting backlog above 100 jobs"
      query  = "max by (queue) ({\"tickif.queue.jobs\",${local.env_selector},state=\"waiting\"})"
      target = 100, window = "10m", match = "all_the_times", severity = "warning"
    }
    queue_head_age = {
      title  = "Queue head creation age above five minutes"
      query  = "max by (queue) ({\"tickif.queue.next_waiting_job_age\",${local.env_selector}})"
      target = 300, window = "10m", match = "all_the_times", severity = "warning"
    }
    collector_queue = {
      title  = "Collector sending queue above 80%"
      query  = "max by (exporter) (otelcol_exporter_queue_size{${local.env_selector}} / clamp_min(otelcol_exporter_queue_capacity{${local.env_selector}}, 1))"
      target = 0.8, window = "5m", match = "all_the_times", severity = "warning"
    }
    collector_drops = {
      title  = "Collector cannot enqueue telemetry"
      query  = "(sum(increase(otelcol_exporter_enqueue_failed_log_records{${local.env_selector}}[5m])) or vector(0)) + (sum(increase(otelcol_exporter_enqueue_failed_spans{${local.env_selector}}[5m])) or vector(0)) + (sum(increase(otelcol_exporter_enqueue_failed_metric_points{${local.env_selector}}[5m])) or vector(0))"
      target = 0, window = "5m", match = "at_least_once", severity = "critical"
    }
    host_missing = {
      title  = "Host telemetry missing for five minutes"
      query  = "absent_over_time({\"system.cpu.time\",${local.env_selector}}[5m])"
      target = 0, window = "2m", match = "all_the_times", severity = "critical"
    }
  }
}

resource "signoz_rule" "operations" {
  for_each       = local.operational_rules
  alert          = "Tickif ${var.environment}: ${each.value.title}"
  alert_type     = "METRIC_BASED_ALERT"
  rule_type      = "promql_rule"
  schema_version = "v2alpha1"
  disabled       = !var.enable_alerts
  description    = "Verify metric names/units and query results in staging before enabling. Queue head age is creation age, not exact eligible waiting time."
  labels         = { environment = var.environment, service_namespace = "tickif", severity = each.value.severity }
  annotations    = { summary = each.value.title, runbook = "docs/runbooks/observability.md" }
  condition = {
    selected_query_name = "A"
    composite_query = {
      panel_type = "graph"
      query_type = "promql"
      queries    = [{ promql = { type = "promql", spec = { name = "A", query = each.value.query } } }]
    }
    thresholds = {
      basic = {
        kind = "basic"
        spec = [{ name = each.value.severity, op = "above", target = each.value.target, match_type = each.value.match, channels = var.notification_channels }]
      }
    }
  }
  evaluation            = { rolling = { kind = "rolling", spec = { eval_window = each.value.window, frequency = "1m" } } }
  notification_settings = {}
}
