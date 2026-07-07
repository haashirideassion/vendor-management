import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { SolarIcon } from "@/components/shared/SolarIcon"

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center bg-background">
      <SolarIcon name="question" className="h-12 w-12 text-muted-foreground" />
      <div>
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="text-muted-foreground mt-1">The page you're looking for doesn't exist.</p>
      </div>
      <Button asChild variant="outline"><Link to="/">Go home</Link></Button>
    </div>
  )
}
