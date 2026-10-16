// A link (DESIGN.md, Link): the only `<a>` of the application, a real address, so Ctrl+click, the middle click and the
// status bar work. `inline` is the mockup's `lnk` (accent-ink at 500; under the ink accent a line-2 underline);
// `quiet` keeps the ink of its context (a name that opens its row, on the home); `icon` is an icon button that goes
// somewhere (the logo), with its tooltip. The focus ring on keyboard focus only.
import { useMergeRefs } from "@floating-ui/react";
import type { Placement } from "@floating-ui/react";
import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";
import { Icon } from "./Icon";
import { useTooltip } from "./Tooltip";
import "./control.css";
import "./IconButton.css";
import "./Link.css";

type Anchor = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "style" | "title" | "className" | "children">;

export type LinkProps = Anchor & {
  href: string;
  variant?: "inline" | "quiet";
  children: ReactNode;
  ref?: Ref<HTMLAnchorElement>;
  "data-force"?: "focus";
};

export function Link({ href, variant = "inline", children, ref, ...rest }: LinkProps) {
  return (
    <a {...rest} ref={ref} href={href} className="ui-link" data-variant={variant}>
      {children}
    </a>
  );
}

export type IconLinkProps = Anchor & {
  href: string;
  /** The words of the destination: the accessible name and the tooltip. */
  label: string;
  icon: ReactNode;
  tooltipPlacement?: Placement;
  tooltipOpen?: boolean;
  ref?: Ref<HTMLAnchorElement>;
};

export function IconLink({ href, label, icon, tooltipPlacement, tooltipOpen, ref, ...rest }: IconLinkProps) {
  const tip = useTooltip({ label, placement: tooltipPlacement, open: tooltipOpen });
  const merged = useMergeRefs([ref, tip.setReference]);
  return (
    <>
      <a {...tip.getReferenceProps(rest)} ref={merged} href={href} className="ui-control ui-icon-button" aria-label={label}>
        <Icon>{icon}</Icon>
      </a>
      {tip.node}
    </>
  );
}
