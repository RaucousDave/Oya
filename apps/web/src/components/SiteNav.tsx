import { useEffect, useState } from "react";
import { ArrowRightIcon, CloseIcon, MenuIcon } from "./Icons";
import { Wordmark } from "./Logo";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#merchants", label: "For merchants" },
  { href: "#developers", label: "Developers" },
  { href: "#faq", label: "FAQ" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="site-nav" data-scrolled={scrolled}>
      <div className="wrap">
        <div className="site-nav__inner">
          <a href="#top" aria-label="Oya home">
            <Wordmark />
          </a>

          <nav className="site-nav__links" aria-label="Primary">
            {LINKS.map((link) => (
              <a key={link.href} className="site-nav__link" href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="site-nav__actions">
            <a className="site-nav__signin" href="#start">
              Sign in
            </a>
            <a className="btn btn--primary btn--sm" href="#start">
              Create a payment
              <ArrowRightIcon size={14} />
            </a>
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={open}
              aria-controls="nav-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
            </button>
          </div>
        </div>
      </div>

      <div className="nav-menu" id="nav-menu" data-open={open}>
        <div className="wrap">
          {LINKS.map((link) => (
            <a
              key={link.href}
              className="nav-menu__link"
              href={link.href}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <a
            className="btn btn--primary btn--block"
            href="#start"
            onClick={() => setOpen(false)}
          >
            Create a payment
            <ArrowRightIcon size={15} />
          </a>
        </div>
      </div>
    </header>
  );
}
