// A choice that opens a list (DESIGN.md, Navigation: context choices): the value as a word with a chevron; the list is
// a popover layer of options (`Option.css`): the keyboard position on accent-weak, the chosen one with its check. Keyboard: arrows, Enter,
// typeahead, Escape. The trigger is a 32 px control; `triggerLabel` puts fixed words on it ("Compare with…") in place
// of the chosen option's label; `loading` turns it busy (the list stays shut until the answer comes).
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingList,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  useTypeahead,
} from "@floating-ui/react";
import { Check } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { EDGE, POPOVER_OFFSET } from "./geometry";
import "./Option.css";
import "./Select.css";

export type SelectOption = Readonly<{ value: string; label: string }>;

export type SelectProps = {
  label: string;
  name: string;
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Why it is disabled, said in the trigger's tooltip. */
  disabledReason?: string;
  /** Fixed words on the trigger instead of the chosen option's label. */
  triggerLabel?: string;
  /** Busy: a spinner in the trigger, the list shut. */
  loading?: boolean;
  /** Opens the list from the start (the primitives page). */
  defaultOpen?: boolean;
};

export function Select({ label, name, options, value, onChange, disabled, disabledReason, triggerLabel, loading, defaultOpen = false }: SelectProps) {
  const [open, setOpen] = useState(defaultOpen);
  const inert = disabled || loading;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const elements = useRef<Array<HTMLElement | null>>([]);
  const labels = useRef<Array<string | null>>([]);
  labels.current = options.map((option) => option.label);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next) => setOpen(inert ? false : next),
    placement: "bottom-start",
    middleware: [offset(POPOVER_OFFSET), flip({ padding: EDGE }), shift({ padding: EDGE })],
    whileElementsMounted: autoUpdate,
  });
  const interactions = useInteractions([
    useClick(context, { enabled: !inert }),
    useDismiss(context),
    useRole(context, { role: "listbox" }),
    useListNavigation(context, { listRef: elements, activeIndex, selectedIndex, onNavigate: setActiveIndex, loop: true }),
    useTypeahead(context, { listRef: labels, activeIndex, selectedIndex, onMatch: open ? setActiveIndex : undefined }),
  ]);
  const choose = (index: number) => {
    onChange(options[index].value);
    setOpen(false);
  };
  const current = options[selectedIndex];
  return (
    <>
      <Button
        ref={refs.setReference}
        chevron
        disabled={disabled}
        loading={loading}
        tooltip={disabled && disabledReason ? disabledReason : undefined}
        aria-label={label}
        {...interactions.getReferenceProps()}
        className="ui-select-trigger"
      >
        {triggerLabel ?? current?.label ?? ""}
      </Button>
      {open && !inert ? (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={defaultOpen ? -1 : 0}>
            <div ref={refs.setFloating} style={floatingStyles} className="ui-listbox" data-layer={name} aria-label={label} {...interactions.getFloatingProps()}>
              <FloatingList elementsRef={elements} labelsRef={labels}>
                {options.map((option, index) => (
                  <div
                    key={option.value}
                    ref={(node) => {
                      elements.current[index] = node;
                    }}
                    role="option"
                    className="ui-option"
                    tabIndex={index === activeIndex ? 0 : -1}
                    aria-selected={index === selectedIndex}
                    data-active={index === activeIndex ? "" : undefined}
                    {...interactions.getItemProps({ onClick: () => choose(index), onKeyDown: (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        choose(index);
                      }
                    } })}
                  >
                    <span className="ui-option-text">{option.label}</span>
                    {index === selectedIndex ? (
                      <span className="ui-option-check">
                        <Icon>
                          <Check />
                        </Icon>
                      </span>
                    ) : null}
                  </div>
                ))}
              </FloatingList>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  );
}
