import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:border-slate-200 group-[.toaster]:bg-white group-[.toaster]:text-slate-900 group-[.toaster]:shadow-lg dark:group-[.toaster]:border-slate-700 dark:group-[.toaster]:bg-slate-900 dark:group-[.toaster]:text-slate-100",
          success:
            "group-[.toaster]:border-emerald-800 group-[.toaster]:bg-emerald-700 group-[.toaster]:text-emerald-50 dark:group-[.toaster]:border-emerald-700 dark:group-[.toaster]:bg-emerald-950 dark:group-[.toaster]:text-emerald-100",
          error:
            "group-[.toaster]:border-red-800 group-[.toaster]:bg-red-700 group-[.toaster]:text-red-50 dark:group-[.toaster]:border-red-700 dark:group-[.toaster]:bg-red-950 dark:group-[.toaster]:text-red-100",
          warning:
            "group-[.toaster]:border-amber-700 group-[.toaster]:bg-amber-100 group-[.toaster]:text-amber-950 dark:group-[.toaster]:border-amber-700 dark:group-[.toaster]:bg-amber-950 dark:group-[.toaster]:text-amber-100",
          info:
            "group-[.toaster]:border-blue-700 group-[.toaster]:bg-blue-100 group-[.toaster]:text-blue-950 dark:group-[.toaster]:border-blue-700 dark:group-[.toaster]:bg-blue-950 dark:group-[.toaster]:text-blue-100",
          description: "group-[.toast]:text-slate-600 dark:group-[.toast]:text-slate-300",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
