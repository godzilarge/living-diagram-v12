// A file input, hidden (the only `<input type="file">` of the application): a control of the page opens it (`click()`
// through a selector or a ref, e.g. the edit palette's image tool); the file chosen is handed over, and the input is
// emptied so the same file can be chosen again. Out of the tab order and of the accessibility tree: the control that
// opens it carries the words.
import type { InputHTMLAttributes, Ref } from "react";
import "./control.css";

export type FileInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "style" | "title" | "onChange" | "value"> & {
  onFile: (file: File) => void;
  ref?: Ref<HTMLInputElement>;
};

export function FileInput({ onFile, ref, className, ...rest }: FileInputProps) {
  return (
    <input
      {...rest}
      ref={ref}
      type="file"
      tabIndex={-1}
      aria-hidden="true"
      className={["ui-visually-hidden", className ?? ""].join(" ").trim()}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) onFile(file);
      }}
    />
  );
}
