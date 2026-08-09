import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="flex flex-col items-center gap-2 border-t border-border px-4 py-8 text-center text-xs text-muted-fg">
      <div className="flex items-center gap-4">
        <Link to="/privacy" className="hover:text-fg hover:underline">
          Privacy Policy
        </Link>
        <Link to="/terms" className="hover:text-fg hover:underline">
          Terms of Service
        </Link>
      </div>
      <p>
        © Crewclock ·{' '}
        <a href="mailto:crewclocknz@gmail.com" className="hover:text-fg hover:underline">
          crewclocknz@gmail.com
        </a>
      </p>
    </footer>
  )
}
