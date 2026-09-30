import type { DemoUser } from '@/domain/prototype'
import type { AppRouteRecord } from '@/types/router'
import { useMenuStore } from '@/store/modules/menu'
import { getHomePath, getNavigation } from '@/router/access'

export function syncPrototypeShell(user: DemoUser): void {
  const role = user.role
  const menuStore = useMenuStore()
  const menuList: AppRouteRecord[] = getNavigation(role, user).map((item) => ({
    path: item.path,
    name: item.path.slice(1),
    component: () => Promise.resolve({}),
    meta: {
      title: item.label,
      icon: item.icon,
      isFirstLevel: true,
      roles: [role]
    }
  }))

  menuStore.setMenuList(menuList)
  menuStore.setHomePath(getHomePath(role))
}
