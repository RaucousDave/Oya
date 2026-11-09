export function Mesh({ full = false }: { full?: boolean }) {
  return (
    <div className={full ? "mesh mesh--full" : "mesh"} aria-hidden="true">
      <div className="mesh__wash" />
      <div className="mesh__grain" />
    </div>
  );
}
