// The icon of each button of a contextual bar (`state/bars.ts` names them, Lucide draws them): one place, so a bar
// and its volets say the same thing the same way. Decorative: the words are the button's tooltip.
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, ArrowRight, ArrowRightLeft, BetweenHorizontalEnd,
  BetweenVerticalEnd, Blend, Bold, BringToFront, Code, Copy, Ellipsis, EyeOff, Focus, Group, Highlighter, ImageUp, Italic,
  LineStyle, ListOrdered, Lock, LockOpen, Minus, MoveVertical, PaintBucket, Paintbrush, PanelTop, Pin, PinOff, Route,
  SendToBack, Shapes, Square, SquareDashedMousePointer, SquareRoundCorner, Tag, TextAlignCenter, TextAlignEnd,
  TextAlignStart, TextCursorInput, Trash2, Type, Underline, Baseline, LayoutGrid,
} from "lucide-react";
import type { ReactNode } from "react";
import type { BarAlign } from "@engine/app/state/floating";
import type { BarIcon } from "../state/bars";

const BAR: Readonly<Record<BarIcon, () => ReactNode>> = {
  pin: () => <Pin />, unpin: () => <PinOff />, lock: () => <Lock />, unlock: () => <LockOpen />, group: () => <Group />,
  align: () => <AlignCenterVertical />, hide: () => <EyeOff />, isolate: () => <Focus />, more: () => <Ellipsis />,
  textSize: () => <Type />, bold: () => <Bold />, italic: () => <Italic />, underline: () => <Underline />,
  alignLeft: () => <TextAlignStart />, alignCenter: () => <TextAlignCenter />, alignRight: () => <TextAlignEnd />,
  textColor: () => <Baseline />, textStyle: () => <Baseline />, titlePosition: () => <PanelTop />, back: () => <SendToBack />, front: () => <BringToFront />,
  duplicate: () => <Copy />, delete: () => <Trash2 />, editLabel: () => <TextCursorInput />, fill: () => <PaintBucket />,
  border: () => <Square />, corners: () => <SquareRoundCorner />, addRow: () => <BetweenHorizontalEnd />,
  addColumn: () => <BetweenVerticalEnd />, header: () => <PanelTop />, replace: () => <ImageUp />, opacity: () => <Blend />,
  heads: () => <ArrowRight />, route: () => <Route />, width: () => <Minus />, lineStyle: () => <LineStyle />,
  reverse: () => <ArrowRightLeft />, shape: () => <Shapes />, labelPosition: () => <Tag />,
  selectMembers: () => <SquareDashedMousePointer />, paint: () => <Paintbrush />, codeLanguage: () => <Code />,
  codeFont: () => <Type />, highlight: () => <Highlighter />, lineNumbers: () => <ListOrdered />, fitHeight: () => <MoveVertical />,
};

export const barIcon = (icon: BarIcon): ReactNode => BAR[icon]();

const ALIGN: Readonly<Record<BarAlign, () => ReactNode>> = {
  left: () => <AlignStartVertical />, center: () => <AlignCenterVertical />, right: () => <AlignEndVertical />,
  top: () => <AlignStartHorizontal />, middle: () => <AlignCenterHorizontal />, bottom: () => <AlignEndHorizontal />,
  "distribute-horizontal": () => <AlignHorizontalDistributeCenter />, "distribute-vertical": () => <AlignVerticalDistributeCenter />,
};

export const alignIcon = (mode: BarAlign): ReactNode => ALIGN[mode]();
export const gridIcon = (): ReactNode => <LayoutGrid />;
