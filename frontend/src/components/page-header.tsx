import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="ow-page-header">
      <div>
        <h2 className="ow-page-title">{title}</h2>
        {description ? <p className="ow-page-subtitle">{description}</p> : null}
      </div>
      {actions ? <div className="ow-page-actions">{actions}</div> : null}
    </header>
  );
}
