import { Button } from "@ERPTrisThom/ui/components/button";
import { Input } from "@ERPTrisThom/ui/components/input";
import { Label } from "@ERPTrisThom/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

export default function SignInForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const verificationError = currentUrl.searchParams.get("error");
    if (!verificationError) return;

    toast.error(
      verificationError === "INVALID_TOKEN"
        ? "Ce lien est invalide, expiré ou a déjà été utilisé. Demandez-en un nouveau."
        : "La connexion par e-mail a échoué. Demandez un nouveau lien.",
    );
    currentUrl.searchParams.delete("error");
    window.history.replaceState(window.history.state, "", currentUrl);
  }, []);

  const form = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.magicLink(
        {
          email: value.email,
          callbackURL: "/dashboard",
          errorCallbackURL: "/dashboard",
        },
        {
          onSuccess: () => setSentTo(value.email),
          onError: (error) => {
            toast.error(
              error.error.message ||
                "Le lien de connexion n’a pas pu être envoyé. Veuillez réessayer.",
            );
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Saisissez une adresse e-mail valide"),
      }),
    },
  });

  if (sentTo) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold tracking-[0.16em] text-[#8b1629] uppercase">
          Bouillon Comptoir
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold">Consultez vos e-mails</h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          Un lien de connexion a été envoyé à <strong>{sentTo}</strong>. Il expire dans 10 minutes
          et ne peut être utilisé qu’une seule fois.
        </p>
        <p className="mt-3 text-sm text-stone-500">
          Vous ne le voyez pas ? Vérifiez vos courriers indésirables.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 w-full"
          onClick={() => setSentTo(null)}
        >
          Utiliser une autre adresse
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-bold tracking-[0.16em] text-[#8b1629] uppercase">
        Bouillon Comptoir
      </p>
      <h1 className="mt-2 font-serif text-4xl font-bold">Connexion</h1>
      <p className="mt-2 text-sm text-stone-500">
        Recevez un lien sécurisé pour accéder à votre espace de gestion commerciale.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          form.handleSubmit();
        }}
        className="mt-7 space-y-4"
      >
        <form.Field name="email">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Adresse e-mail</Label>
              <Input
                id={field.name}
                name={field.name}
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              {field.state.meta.errors.map((error) => (
                <p key={error?.message} className="text-sm text-red-600">
                  {error?.message}
                </p>
              ))}
            </div>
          )}
        </form.Field>

        <form.Subscribe
          selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? "Envoi…" : "Recevoir le lien de connexion"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}
