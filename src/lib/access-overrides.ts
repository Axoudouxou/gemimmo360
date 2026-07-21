// Individual user overrides that grant module access beyond their role.
export const CHRISTELLE_KOUASSI_ID = "2f7ca4a8-1730-4d83-88fb-3faa423dcaf6";

// Users that get full access to every module regardless of their role.
export const FULL_ACCESS_USER_IDS: readonly string[] = [CHRISTELLE_KOUASSI_ID];

export function hasModuleAccess(
  role: string | null | undefined,
  userId: string | null | undefined,
  allowedRoles: readonly string[],
): boolean {
  if (userId && FULL_ACCESS_USER_IDS.includes(userId)) return true;
  return !!role && allowedRoles.includes(role);
}
