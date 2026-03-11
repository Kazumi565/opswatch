import type { ReactNode } from "react";

type DataTableShellProps = {
  children: ReactNode;
  className?: string;
};

type DataTableProps = {
  children: ReactNode;
  className?: string;
};

function joinClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function DataTableShell({ children, className }: DataTableShellProps) {
  return <section className={joinClasses("ow-table-shell", className)}>{children}</section>;
}

export function DataTable({ children, className }: DataTableProps) {
  return <table className={joinClasses("ow-table", className)}>{children}</table>;
}