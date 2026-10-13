// A real link the app handles itself. A plain click moves inside the app with
// no page load; anything else (a new tab, a new window, a middle click, "copy
// link") is the browser's, and lands on the same address cold.
export default function NavLink({ href, onNavigate, current = false, children, ...rest }) {
  return (
    <a
      href={href}
      aria-current={current ? "page" : undefined}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onNavigate();
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
