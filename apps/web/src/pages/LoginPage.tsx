import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ErrorMessage } from "../components/PaymentShell";
import { api, RequestError } from "../lib/api";

function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: async ({ signal }) => {
      try {
        return await api.session(signal);
      } catch (error) {
        if (error instanceof RequestError && error.statusCode === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
}

export function RequireMerchant() {
  const session = useSession();
  const { pathname } = useLocation();
  if (session.isPending) return <p role="status">Checking your session…</p>;
  if (session.error) return <ErrorMessage error={session.error} />;
  return session.data ? <Outlet /> : <Navigate to="/login" replace state={{ from: pathname }} />;
}

export function LoginPage() {
  const client = useQueryClient();
  const session = useSession();
  const { state } = useLocation();
  const destination = typeof state?.from === "string" && /^\/(dashboard(?:\/payments\/[^/]+)?|payments\/new)$/.test(state.from)
    ? state.from : "/dashboard";
  const [signup, setSignup] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: { email: string; password: string; businessName: string }) =>
      signup ? api.signup(input) : api.login({ email: input.email, password: input.password }),
    onSuccess: (merchant) => client.setQueryData(["session"], merchant),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    mutation.mutate({
      email: String(fields.get("email")),
      password: String(fields.get("password")),
      businessName: String(fields.get("businessName") ?? ""),
    });
  }

  if (session.data) return <Navigate to={destination} replace />;
  return <section className="product-card product-narrow">
    <h1>{signup ? "Create a merchant account" : "Merchant sign in"}</h1>
    <form className="product-form" onSubmit={submit}>
      {signup && <label>Business name<input name="businessName" autoComplete="organization" maxLength={120} required /></label>}
      <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <label>Password<input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={8} maxLength={128} required /></label>
      {mutation.error && <ErrorMessage error={mutation.error} />}
      <button className="product-primary" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Please wait…" : signup ? "Create account" : "Sign in"}
      </button>
    </form>
    <button className="product-secondary" type="button" disabled={mutation.isPending}
      onClick={() => { mutation.reset(); setSignup(!signup); }}>
      {signup ? "Sign in instead" : "Create an account"}
    </button>
  </section>;
}
