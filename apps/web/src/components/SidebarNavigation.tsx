import { useId, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
export interface SidebarItem {
  path: string;
  label: string;
  icon: IconName;
}
export interface SidebarCategory {
  key: string;
  label: string;
  icon: IconName;
  items: SidebarItem[];
}
/** Navegación por categorías, sin persistir su apertura entre sesiones.
 * Los elementos ya llegan filtrados por los permisos de Workspace. */
export function SidebarNavigation({
  categories,
  currentPath,
  home,
  renderLink,
}: {
  categories: readonly SidebarCategory[];
  currentPath: string;
  home: ReactNode;
  renderLink: (item: SidebarItem) => ReactNode;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const id = useId();
  return (
    <nav aria-label="Navegación principal">
      <div className="nav-group sidebar-home">{home}</div>
      {categories
        .filter((category) => category.items.length > 0)
        .map((category) => {
          const open = expanded === category.key,
            active = category.items.some((item) => item.path === currentPath);
          const contentId = `${id}-${category.key}`;
          return (
            <div className="nav-group sidebar-category" key={category.key}>
              <button
                type="button"
                className="sidebar-category-toggle"
                aria-expanded={open}
                aria-controls={contentId}
                title={category.label}
                aria-label={category.label}
                data-active={active || undefined}
                onClick={() =>
                  setExpanded((previous) =>
                    previous === category.key ? null : category.key,
                  )
                }
              >
                <Icon name={category.icon} size={18} />
                <span className="nav-label">{category.label}</span>
                <span className="sidebar-category-chevron" aria-hidden="true">
                  <Icon name="chevron" size={14} />
                </span>
              </button>
              <ul
                className="sidebar-category-links"
                id={contentId}
                hidden={!open}
              >
                {category.items.map((item) => (
                  <li key={item.path}>{renderLink(item)}</li>
                ))}
              </ul>
            </div>
          );
        })}
    </nav>
  );
}
