export function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <span>
      {children}
      <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
    </span>
  )
}
