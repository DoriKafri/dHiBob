import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors", {
  variants: {
    variant: {
      default: "border-transparent bg-primary-500 text-white",
      secondary: "border-transparent bg-gray-100 text-gray-900 dark:bg-charcoal-700 dark:text-white",
      destructive: "border-transparent bg-red-500 text-white",
      outline: "text-gray-700 dark:text-gray-300 dark:border-charcoal-700",
      success: "border-transparent bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
      warning: "border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { Badge, badgeVariants };
