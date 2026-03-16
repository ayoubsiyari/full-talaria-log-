import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3090FF] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 transform hover:-translate-y-0.5",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-[#3090FF] to-[#232CF4] text-white shadow-[0_4px_15px_rgba(48,144,255,0.3)] hover:shadow-[0_6px_20px_rgba(48,144,255,0.4)] hover:from-[#232CF4] hover:to-[#353089]",
        destructive: "bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-lg hover:shadow-xl",
        outline: "bg-transparent border border-[#5FACF9] text-[#5FACF9] hover:bg-[#3090FF] hover:border-[#3090FF] hover:text-white shadow-[0_4px_15px_rgba(48,144,255,0.3)]",
        secondary: "bg-white/10 backdrop-blur-sm text-white border border-white/20 hover:bg-white/15 hover:border-white/30",
        ghost: "bg-transparent text-white hover:bg-[#3090FF]/10 hover:text-[#3090FF]",
        link: "text-[#5FACF9] underline-offset-4 hover:underline hover:text-[#3090FF]",
        brand: "bg-gradient-to-r from-[#3090FF] to-[#232CF4] text-white shadow-[0_4px_15px_rgba(48,144,255,0.3)] hover:shadow-[0_6px_20px_rgba(48,144,255,0.4)]",
        glass: "bg-white/5 backdrop-blur-sm text-white border border-[#3090FF]/20 hover:bg-[#3090FF]/10 hover:border-[#3090FF]/30",
      },
      size: {
        default: "h-11 px-6 py-3",
        sm: "h-9 rounded-lg px-4 py-2 text-sm",
        lg: "h-13 rounded-xl px-8 py-4 text-base",
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

