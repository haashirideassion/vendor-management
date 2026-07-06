import type { ComponentType, SVGProps } from "react"
import {
  BellBoldDuotone,
  BillListBoldDuotone,
  BoxBoldDuotone,
  CaseRoundBoldDuotone,
  ChartSquareBoldDuotone,
  CheckCircleBoldDuotone,
  ClipboardListBoldDuotone,
  ClockCircleBoldDuotone,
  DangerCircleBoldDuotone,
  DocumentTextBoldDuotone,
  DocumentsBoldDuotone,
  EyeBoldDuotone,
  FolderWithFilesBoldDuotone,
  GraphUpBoldDuotone,
  HamburgerMenuBoldDuotone,
  Logout3BoldDuotone,
  PenBoldDuotone,
  SettingsBoldDuotone,
  ShieldUserBoldDuotone,
  TrashBinTrashBoldDuotone,
  UploadBoldDuotone,
  UserRoundedBoldDuotone,
  UsersGroupRoundedBoldDuotone,
} from "solar-icon-set"

type SolarIconComponent = ComponentType<SVGProps<SVGSVGElement> & { color?: string; size?: number | string }>

export const solarIcons = {
  admin: ShieldUserBoldDuotone,
  analytics: GraphUpBoldDuotone,
  approvals: CheckCircleBoldDuotone,
  audit: ClipboardListBoldDuotone,
  categories: BoxBoldDuotone,
  contracts: FolderWithFilesBoldDuotone,
  documents: DocumentsBoldDuotone,
  edit: PenBoldDuotone,
  engagements: CaseRoundBoldDuotone,
  invoices: BillListBoldDuotone,
  menu: HamburgerMenuBoldDuotone,
  notifications: BellBoldDuotone,
  po: DocumentTextBoldDuotone,
  reports: ChartSquareBoldDuotone,
  settings: SettingsBoldDuotone,
  statusPending: ClockCircleBoldDuotone,
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
