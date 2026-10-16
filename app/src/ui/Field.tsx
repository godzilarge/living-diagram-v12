// A text field (DESIGN.md, Inputs): paper, a 1 px line-2 border, 32 px high, body text, the placeholder in ink-3; on
// focus the border takes the accent and the ring; an invalid value gets the error border and its message below.
import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { Icon } from "./Icon";
import "./Field.css";

export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "style" | "title" | "size"> & {
  /** The accessible name; fields in a bar have no visible label. */
  label: string;
  icon?: ReactNode;
  /** The message of an invalid value, shown under the field. */
  error?: string;
  ref?: Ref<HTMLInputElement>;
  "data-force"?: "focus";
};

export function Field({ label, icon, error, className, ref, disabled, ...rest }: FieldProps) {
  const messageId = useId();
  return (
    <span className={["ui-field", className ?? ""].join(" ").trim()} data-invalid={error ? "" : undefined}>
      <span className="ui-field-box">
        {icon ? (
          <span className="ui-field-icon">
            <Icon>{icon}</Icon>
          </span>
        ) : null}
        <input
          {...rest}
          ref={ref}
          className="ui-field-input"
          aria-label={label}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? messageId : undefined}
          disabled={disabled}
          data-icon={icon ? "" : undefined}
        />
      </span>
      {error ? (
        <span className="ui-field-error" id={messageId}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
