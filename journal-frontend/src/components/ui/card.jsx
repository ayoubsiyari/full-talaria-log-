import * as React from "react"
import { cn } from "../../lib/utils"

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("card-glow fade-in", className)}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-2 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("heading-md text-theme-primary", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-theme-secondary", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

// Additional card variants for different use cases
const MetricCard = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("metric-card scale-in", className)}
    {...props}
  />
))
MetricCard.displayName = "MetricCard"

const ChartCard = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("chart-container fade-in", className)}
    {...props}
  />
))
ChartCard.displayName = "ChartCard"

const GlassCard = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("glass-strong rounded-xl p-6 fade-in", className)}
    {...props}
  />
))
GlassCard.displayName = "GlassCard"

export { 
  Card, 
  CardHeader, 
  CardFooter, 
  CardTitle, 
  CardDescription, 
  CardContent,
  MetricCard,
  ChartCard,
  GlassCard
}
