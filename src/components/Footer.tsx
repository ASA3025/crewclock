export function Footer() {
  return (
    <footer className="border-t border-border px-4 py-8 text-center text-xs text-muted-fg">
      © {new Date().getFullYear()} Crewclock ·{' '}
      <a href="mailto:arundeepatkar2008@gmail.com" className="hover:text-fg hover:underline">
        arundeepatkar2008@gmail.com
      </a>
    </footer>
  )
}
