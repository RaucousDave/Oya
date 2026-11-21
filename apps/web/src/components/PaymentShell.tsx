import { NavLink, Link, Outlet } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PaymentStatus } from "@oya/contracts";
import { statusLabels } from "../lib/payments";
import { api } from "../lib/api";
import { ThemeToggle } from "./ThemeToggle";

export function PaymentShell() {
  return <div className="oya-product">
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="product-header">
      <Link className="wordmark" to="/" aria-label="Oya home">oya<span>↗</span></Link>
      <nav aria-label="Merchant navigation">
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/payments/new">New payment</NavLink>
      </nav>
      <ThemeToggle />
    </header>
    <main id="content" className="product-content"><Outlet /></main>
  </div>;
}

export function SignOut() {
  const client = useQueryClient();
  const logout = useMutation({ mutationFn: api.logout, onSuccess: () => {
    client.removeQueries({ queryKey: ["merchant"] });
    client.setQueryData(["session"], null);
  } });
  return <div>
    <button className="product-secondary" type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>Sign out</button>
    {logout.error && <ErrorMessage error={logout.error} />}
  </div>;
}

export function ErrorMessage({ error }: { error: Error }) {
  return <p className="product-error" role="alert">{error.message}</p>;
}

export function Status({ value }: { value: PaymentStatus }) {
  return <span className="product-status" data-status={value}>{statusLabels[value]}</span>;
}
