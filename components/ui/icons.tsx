/**
 * Icon set — Lucide, behind a thin adapter.
 *
 * Everything imports from this module rather than from `lucide-react`, which
 * keeps three things in one place: the house defaults (16px, 1.75 stroke — a
 * lighter line than Lucide's default 2, which reads better at enterprise
 * density), the accessibility attributes, and the product's own names for
 * icons. Swapping libraries again touches this file only.
 *
 * Named imports stay tree-shakeable, so only the icons listed here ship.
 *
 * Selection follows design.md §58: plain line icons — no robotic heads,
 * sparkles, AI stars or 3D.
 */
import {
  ArrowDown as LuArrowDown,
  ArrowRight as LuArrowRight,
  ArrowUp as LuArrowUp,
  Check as LuCheck,
  ChevronDown as LuChevronDown,
  ChevronsUpDown as LuChevronsUpDown,
  CircleCheck as LuCircleCheck,
  Clock as LuClock,
  Database as LuDatabase,
  FileText as LuFileText,
  Info as LuInfo,
  Layers as LuLayers,
  LogOut as LuLogOut,
  Minus as LuMinus,
  OctagonAlert as LuOctagonAlert,
  Plus as LuPlus,
  Search as LuSearch,
  ShieldCheck as LuShieldCheck,
  TriangleAlert as LuTriangleAlert,
  Upload as LuUpload,
  X as LuX,
  type LucideProps,
} from "lucide-react";

export type IconProps = LucideProps;

/**
 * Icons are decorative by default: they sit beside a text label everywhere in
 * this product, so announcing them would just duplicate the label. Pass
 * `aria-hidden={false}` with an `aria-label` for the rare standalone case.
 */
function withDefaults(Icon: React.ComponentType<LucideProps>) {
  return function StyledIcon({ size = 16, strokeWidth = 1.75, ...props }: LucideProps) {
    return (
      <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" focusable="false" {...props} />
    );
  };
}

export const ArrowUp = withDefaults(LuArrowUp);
export const ArrowDown = withDefaults(LuArrowDown);
export const ArrowRight = withDefaults(LuArrowRight);
export const ChevronDown = withDefaults(LuChevronDown);
export const ChevronUpDown = withDefaults(LuChevronsUpDown);
export const Check = withDefaults(LuCheck);
export const CheckCircle = withDefaults(LuCircleCheck);
export const AlertTriangle = withDefaults(LuTriangleAlert);
export const AlertOctagon = withDefaults(LuOctagonAlert);
export const Clock = withDefaults(LuClock);
export const Search = withDefaults(LuSearch);
export const Upload = withDefaults(LuUpload);
export const FileText = withDefaults(LuFileText);
export const X = withDefaults(LuX);
export const Minus = withDefaults(LuMinus);
export const Info = withDefaults(LuInfo);
export const Layers = withDefaults(LuLayers);
export const Shield = withDefaults(LuShieldCheck);
export const Database = withDefaults(LuDatabase);
export const Plus = withDefaults(LuPlus);
export const LogOut = withDefaults(LuLogOut);
