import * as React from "react"
import { cn } from "../../lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "input-theme",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = "Input"

// Additional input variants
const SearchInput = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <input
      type="search"
      className={cn(
        "input-theme pl-10 bg-gradient-purple-subtle",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
SearchInput.displayName = "SearchInput"

const GlassInput = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "glass text-theme-primary rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 placeholder:text-theme-muted",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
GlassInput.displayName = "GlassInput"

export { Input, SearchInput, GlassInput }
