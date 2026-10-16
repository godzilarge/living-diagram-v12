// The token asked in the Infrastructures widget, in place of its table: a password field and Connect. Enter submits.
// A refused token says so under the field.
import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Field } from "../ui";
import { useText } from "../i18n";

export function TokenForm({ refused, onConnect }: { refused: boolean; onConnect: (token: string) => void }) {
  const t = useText();
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConnect(value);
  };
  return (
    <form className="home-token" onSubmit={submit}>
      <p className="home-note">{t("home:token.intro")}</p>
      <div className="home-token-row" data-bar="token">
        <Field
          type="password"
          label={t("home:token.label")}
          placeholder={t("home:token.label")}
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={refused ? t("home:token.refused") : undefined}
          className="home-token-field"
        />
        <Button variant="primary" type="submit">
          {t("home:token.connect")}
        </Button>
      </div>
    </form>
  );
}
