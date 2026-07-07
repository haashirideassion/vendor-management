import type { ComponentType, SVGProps } from "react"
import {
  AddCircleBoldDuotone,
  AltArrowDownBoldDuotone,
  AltArrowLeftBoldDuotone,
  AltArrowRightBoldDuotone,
  AltArrowUpBoldDuotone,
  Banknote2BoldDuotone,
  BellBoldDuotone,
  BillListBoldDuotone,
  BoxBoldDuotone,
  Buildings2BoldDuotone,
  CaseRoundBoldDuotone,
  ChartSquareBoldDuotone,
  CheckCircleBoldDuotone,
  CheckSquareBoldDuotone,
  ClipboardListBoldDuotone,
  ClockCircleBoldDuotone,
  CloseCircleBoldDuotone,
  DangerCircleBoldDuotone,
  DeliveryBoldDuotone,
  DocumentTextBoldDuotone,
  DocumentsBoldDuotone,
  EyeBoldDuotone,
  FolderWithFilesBoldDuotone,
  GraphUpBoldDuotone,
  HamburgerMenuBoldDuotone,
  InfoCircleBoldDuotone,
  Logout3BoldDuotone,
  MagniferBoldDuotone,
  MonitorBoldDuotone,
  MoonBoldDuotone,
  PenBoldDuotone,
  QuestionCircleBoldDuotone,
  RefreshCircleBoldDuotone,
  SettingsBoldDuotone,
  ShieldUserBoldDuotone,
  Sun2BoldDuotone,
  TagBoldDuotone,
  TrashBinTrashBoldDuotone,
  UploadBoldDuotone,
  UserRoundedBoldDuotone,
  UsersGroupRoundedBoldDuotone,
  Widget5BoldDuotone,
} from "solar-icon-set"

type SolarIconComponent = ComponentType<SVGProps<SVGSVGElement> & { color?: string; size?: number | string }>

export const solarIcons = {
  add: AddCircleBoldDuotone,
  admin: ShieldUserBoldDuotone,
  analytics: GraphUpBoldDuotone,
  arrowDown: AltArrowDownBoldDuotone,
  arrowLeft: AltArrowLeftBoldDuotone,
  arrowRight: AltArrowRightBoldDuotone,
  arrowUp: AltArrowUpBoldDuotone,
  approvals: CheckCircleBoldDuotone,
  audit: ClipboardListBoldDuotone,
  bank: Banknote2BoldDuotone,
  categories: BoxBoldDuotone,
  check: CheckSquareBoldDuotone,
  contracts: FolderWithFilesBoldDuotone,
  close: CloseCircleBoldDuotone,
  company: Buildings2BoldDuotone,
  dashboard: Widget5BoldDuotone,
  delivery: DeliveryBoldDuotone,
  documents: DocumentsBoldDuotone,
  edit: PenBoldDuotone,
  engagements: CaseRoundBoldDuotone,
  info: InfoCircleBoldDuotone,
  invoices: BillListBoldDuotone,
  menu: HamburgerMenuBoldDuotone,
  moon: MoonBoldDuotone,
  notifications: BellBoldDuotone,
  po: DocumentTextBoldDuotone,
  question: QuestionCircleBoldDuotone,
  refresh: RefreshCircleBoldDuotone,
  reports: ChartSquareBoldDuotone,
  search: MagniferBoldDuotone,
  settings: SettingsBoldDuotone,
  statusPending: ClockCircleBoldDuotone,
  sun: Sun2BoldDuotone,
  tag: TagBoldDuotone,
  system: MonitorBoldDuotone,
  upload: UploadBoldDuotone,
  user: UserRoundedBoldDuotone,
  vendors: UsersGroupRoundedBoldDuotone,
  view: EyeBoldDuotone,
  warning: DangerCircleBoldDuotone,
  delete: TrashBinTrashBoldDuotone,
  logout: Logout3BoldDuotone,
} satisfies Record<string, SolarIconComponent>

export type SolarIconName = keyof typeof solarIcons

interface SolarIconProps extends SVGProps<SVGSVGElement> {
  name: SolarIconName
  size?: number | string
  color?: string
}

export function SolarIcon({ name, size = 18, color = "currentColor", ...props }: SolarIconProps) {
  const Icon = solarIcons[name]
  return <Icon aria-hidden="true" focusable="false" color={color} size={size} {...props} />
}

interface SolarDuotoneIconProps extends Omit<SolarIconProps, "name"> {
  icon: SolarIconName
  primaryColor?: string
  secondaryColor?: string
  strokeWidth?: number | string
}

export function SolarDuotoneIcon({
  icon,
  primaryColor,
  secondaryColor,
  strokeWidth,
  color,
  ...props
}: SolarDuotoneIconProps) {
  void secondaryColor
  void strokeWidth
  return <SolarIcon name={icon} color={primaryColor ?? color} {...props} />
}

const iconName = (name: SolarIconName): SolarIconName => name

export const Activity01Icon = iconName("analytics")
export const Add01Icon = iconName("add")
export const Alert01Icon = iconName("warning")
export const AlertCircleIcon = iconName("warning")
export const ArrowDown01Icon = iconName("arrowDown")
export const ArrowLeft01Icon = iconName("arrowLeft")
export const ArrowRight01Icon = iconName("arrowRight")
export const ArrowUp01Icon = iconName("arrowUp")
export const BankIcon = iconName("bank")
export const BarChartIcon = iconName("reports")
export const Briefcase01Icon = iconName("engagements")
export const Building06Icon = iconName("company")
export const Cancel01Icon = iconName("close")
export const ChartBarIncreasingIcon = iconName("analytics")
export const CheckmarkCircle01Icon = iconName("approvals")
export const CheckmarkCircle02Icon = iconName("approvals")
export const Clock01Icon = iconName("statusPending")
export const ComputerActivityIcon = iconName("system")
export const ContractsIcon = iconName("contracts")
export const DashboardSquare01Icon = iconName("dashboard")
export const Delete01Icon = iconName("delete")
export const Delete02Icon = iconName("delete")
export const DeliveryBox01Icon = iconName("delivery")
export const Edit01Icon = iconName("edit")
export const EyeIcon = iconName("view")
export const File01Icon = iconName("documents")
export const InformationCircleIcon = iconName("info")
export const Invoice01Icon = iconName("po")
export const Invoice02Icon = iconName("invoices")
export const Logout01Icon = iconName("logout")
export const Menu01Icon = iconName("menu")
export const Moon01Icon = iconName("moon")
export const Notification01Icon = iconName("notifications")
export const Refresh01Icon = iconName("refresh")
export const Search01Icon = iconName("search")
export const SearchIcon = iconName("search")
export const Sun01Icon = iconName("sun")
export const Tag01Icon = iconName("tag")
export const Tick02Icon = iconName("check")
export const UnfoldMoreIcon = iconName("arrowDown")
export const Upload01Icon = iconName("upload")
export const UserCircleIcon = iconName("user")
export const UserGroup02Icon = iconName("vendors")
