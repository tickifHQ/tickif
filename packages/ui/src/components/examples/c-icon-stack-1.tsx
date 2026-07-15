import { IconStack } from "@repo/ui/components/reui/icon-stack"
import { LayersIcon } from "lucide-react"

export function Pattern() {
  return (
    <div className="flex items-center justify-center">
      <IconStack aria-hidden="true">
        <LayersIcon className="size-4" />
      </IconStack>
    </div>
  )
}