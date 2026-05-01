import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050a10] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-cyan-400/15 text-cyan-50 border border-cyan-400/45 shadow-glow hover:bg-cyan-400/22 hover:border-cyan-400/60 hover:shadow-[0_0_24px_-6px_rgba(34,211,238,0.3)]",
        destructive:
          "bg-red-500/15 text-red-200 border border-red-400/35 hover:bg-red-500/25",
        outline:
          "bg-transparent border border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-100 hover:border-cyan-400/55",
        secondary:
          "bg-cyan-950/50 text-cyan-100 border border-cyan-500/20 hover:bg-cyan-500/10 hover:border-cyan-400/35",
        ghost: "bg-transparent text-cyan-200 hover:bg-cyan-500/10 hover:text-cyan-50",
        link: "text-cyan-400 underline-offset-4 hover:underline hover:text-cyan-300",
        brand:
          "bg-cyan-400/15 text-cyan-50 border border-cyan-400/45 shadow-glow hover:bg-cyan-400/22",
        glass:
          "bg-cyan-950/30 text-cyan-100 border border-cyan-400/20 hover:bg-cyan-500/10 hover:border-cyan-400/35",
      },
      size: {
        default: "h-11 px-6 py-3",
        sm: "h-9 rounded-md px-4 py-2 text-sm",
        lg: "h-13 rounded-lg px-8 py-4 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
