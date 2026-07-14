import { Component, OnInit } from '@angular/core';
import { SearchableSelectOption } from '../../../shared/components/searchable-select/searchable-select.models';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { PaginatedList, getApiErrorMessage } from '../../../core/models/api.models';
import {
  PERMISSIONS,
  PERMISSION_GROUP_CONFIG,
  PERMISSION_GROUP_HINTS,
  PERMISSION_MENU_ORDER,
  collapseDisplayPermissionCodes,
  getFullAccessParent,
  isGroupedChildCode,
  normalizeGroupedPermissionsForEdit,
  stripGroupedChildrenWhenFullAccess
} from '../../../core/models/permissions';
import { ListPagination } from '../../../core/utils/list-pagination';

interface AppUser {
  userId: number;
  username: string;
  fullName: string;
  email?: string;
  phone?: string;
  roleId: number;
  roleName: string;
  isActive: boolean;
  isSuperUser: boolean;
  lastLoginOn?: string;
}

interface AppRole {
  roleId: number;
  roleName: string;
  description?: string;
  isSystem: boolean;
  permissionCodes: string[];
}

interface PermissionItem {
  permissionId: number;
  permissionCode: string;
  displayName: string;
  category: string;
  sortOrder: number;
}

interface PermissionGroupView {
  category: string;
  hint?: string;
  items: PermissionItem[];
}

type UsersRolesView = 'users-list' | 'user-form' | 'roles-list' | 'role-form';

@Component({
  selector: 'app-users-roles',
  templateUrl: './users-roles.component.html',
  styleUrl: './users-roles.component.scss',
  standalone: false
})
export class UsersRolesComponent implements OnInit {
  view: UsersRolesView = 'users-list';
  users: AppUser[] = [];
  userPagination = new ListPagination();
  roles: AppRole[] = [];
  permissions: PermissionItem[] = [];
  permissionGroups: PermissionGroupView[] = [];
  loading = false;
  saving = false;
  message = '';
  errorMessage = '';

  editingUserId: number | null = null;
  editingSuperUserSelf = false;
  userForm;

  editingRoleId: number | null = null;
  roleForm;
  selectedPermissions = new Set<string>();

  get roleSelectOptions(): SearchableSelectOption[] {
    return this.roles.map(r => ({ value: r.roleId, label: r.roleName }));
  }

  constructor(private api: ApiService, private auth: AuthService, private fb: FormBuilder) {
    this.userForm = this.fb.group({
      username: ['', Validators.required],
      fullName: ['', Validators.required],
      email: [''],
      phone: [''],
      roleId: [null as number | null, Validators.required],
      password: [''],
      isActive: [true]
    });

    this.roleForm = this.fb.group({
      roleName: ['', Validators.required],
      description: ['']
    });
  }

  ngOnInit(): void {
    this.loadAll();
  }

  get userFormTitle(): string {
    return this.editingUserId ? 'Edit User' : 'Add User';
  }

  get roleFormTitle(): string {
    return this.editingRoleId ? 'Edit Role & Permissions' : 'Add Role';
  }

  switchToUsers(): void {
    if (this.saving) return;
    this.view = 'users-list';
    this.errorMessage = '';
  }

  switchToRoles(): void {
    if (this.saving) return;
    this.view = 'roles-list';
    this.errorMessage = '';
  }

  onPageChange(page: number): void {
    this.userPagination.pageNumber = page;
    this.loadUsers();
  }

  onPageSizeChange(size: number): void {
    this.userPagination.pageSize = size;
    this.userPagination.reset();
    this.loadUsers();
  }

  loadAll(): void {
    this.loading = true;
    this.errorMessage = '';
    this.loadUsers();
    this.api.get<AppRole[]>('/roles').subscribe({
      next: res => (this.roles = res.data ?? []),
      error: () => (this.errorMessage = 'Failed to load roles.')
    });
    this.api
      .get<PermissionItem[]>('/roles/permissions')
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.permissions = res.data ?? [];
          this.rebuildPermissionGroups();
        },
        error: () => (this.errorMessage = 'Failed to load permissions.')
      });
  }

  private loadUsers(): void {
    this.api.get<PaginatedList<AppUser>>('/users', this.userPagination.queryParams()).subscribe({
      next: res => {
        this.users = res.data?.items ?? [];
        this.userPagination.applyResponse(res.data);
      },
      error: () => (this.errorMessage = 'Failed to load users.')
    });
  }

  private rebuildPermissionGroups(): void {
    const map = new Map<string, PermissionItem[]>();
    for (const p of this.permissions) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }

    this.permissionGroups = PERMISSION_MENU_ORDER.filter(category => map.has(category)).map(category => ({
      category,
      hint: PERMISSION_GROUP_HINTS[category],
      items: (map.get(category) ?? []).sort((a, b) => a.sortOrder - b.sortOrder)
    }));
  }

  permissionLabel(code: string): string {
    return this.permissions.find(p => p.permissionCode === code)?.displayName ?? code;
  }

  displayPermissionCodes(codes: string[]): string[] {
    return collapseDisplayPermissionCodes(codes);
  }

  trackPermissionGroup(_index: number, group: PermissionGroupView): string {
    return group.category;
  }

  trackPermissionItem(_index: number, item: PermissionItem): string {
    return item.permissionCode;
  }

  hasFullGroupAccess(fullAccessCode: string): boolean {
    return this.selectedPermissions.has(fullAccessCode);
  }

  isPermissionChecked(code: string): boolean {
    const parent = getFullAccessParent(code);
    if (parent && this.selectedPermissions.has(parent)) {
      return true;
    }
    return this.selectedPermissions.has(code);
  }

  isPermissionDisabled(code: string): boolean {
    const parent = getFullAccessParent(code);
    return !!parent && this.selectedPermissions.has(parent);
  }

  onPermissionToggle(code: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.togglePermission(code, !this.isPermissionChecked(code));
  }

  onCategoryToggle(group: PermissionGroupView, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggleCategory(group, !this.isCategoryFullySelected(group));
  }

  onCardClick(code: string, event: Event): void {
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    if (this.isPermissionDisabled(code)) return;
    this.togglePermission(code, !this.isPermissionChecked(code));
  }

  get currentUserId(): number | null {
    return this.auth.currentUser()?.userId ?? null;
  }

  canEditUser(user: AppUser): boolean {
    return !user.isSuperUser || user.userId === this.currentUserId;
  }

  canDeleteUser(user: AppUser): boolean {
    return !user.isSuperUser;
  }

  openCreateUser(): void {
    this.editingUserId = null;
    this.editingSuperUserSelf = false;
    this.view = 'user-form';
    this.errorMessage = '';
    this.userForm.reset({ isActive: true, roleId: this.roles[0]?.roleId ?? null });
    this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
    this.userForm.get('password')?.updateValueAndValidity();
  }

  openEditUser(user: AppUser): void {
    if (!this.canEditUser(user)) {
      this.errorMessage = 'The owner account can only be edited by signing in as that account.';
      return;
    }

    this.editingUserId = user.userId;
    this.editingSuperUserSelf = user.isSuperUser && user.userId === this.currentUserId;
    this.view = 'user-form';
    this.errorMessage = '';
    this.userForm.patchValue({
      username: user.username,
      fullName: user.fullName,
      email: user.email ?? '',
      phone: user.phone ?? '',
      roleId: user.roleId,
      password: '',
      isActive: user.isActive
    });
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.setValidators([Validators.minLength(6)]);
    this.userForm.get('password')?.updateValueAndValidity();

    if (this.editingSuperUserSelf) {
      this.userForm.get('username')?.disable({ emitEvent: false });
      this.userForm.get('roleId')?.disable({ emitEvent: false });
      this.userForm.get('isActive')?.disable({ emitEvent: false });
    } else {
      this.userForm.get('username')?.enable({ emitEvent: false });
      this.userForm.get('roleId')?.enable({ emitEvent: false });
      this.userForm.get('isActive')?.enable({ emitEvent: false });
    }
  }

  cancelUserForm(): void {
    if (this.saving) return;
    this.view = 'users-list';
    this.editingUserId = null;
    this.editingSuperUserSelf = false;
    this.userForm.get('username')?.enable({ emitEvent: false });
    this.userForm.get('roleId')?.enable({ emitEvent: false });
    this.userForm.get('isActive')?.enable({ emitEvent: false });
    this.errorMessage = '';
  }

  saveUser(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }
    const v = this.userForm.getRawValue();
    const body = {
      username: v.username,
      fullName: v.fullName,
      email: v.email || null,
      phone: v.phone || null,
      roleId: v.roleId,
      password: v.password || null,
      isActive: v.isActive
    };
    this.saving = true;
    this.message = '';
    this.errorMessage = '';
    const req = this.editingUserId
      ? this.api.put(`/users/${this.editingUserId}`, { userId: this.editingUserId, ...body })
      : this.api.post('/users', body);
    req.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.message = 'User saved successfully.';
        this.view = 'users-list';
        this.editingUserId = null;
        this.loadAll();
      },
      error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
    });
  }

  deleteUser(user: AppUser): void {
    if (!confirm(`Remove user "${user.fullName}"? They will no longer be able to sign in.`)) return;
    this.api.delete(`/users/${user.userId}`).subscribe({
      next: () => {
        this.message = 'User removed.';
        this.loadAll();
      },
      error: err => (this.errorMessage = getApiErrorMessage(err, 'Delete failed.'))
    });
  }

  openCreateRole(): void {
    this.editingRoleId = null;
    this.view = 'role-form';
    this.errorMessage = '';
    this.roleForm.reset({ roleName: '', description: '' });
    this.selectedPermissions = new Set([PERMISSIONS.dashboard]);
  }

  openEditRole(role: AppRole): void {
    this.editingRoleId = role.roleId;
    this.view = 'role-form';
    this.errorMessage = '';
    this.roleForm.patchValue({ roleName: role.roleName, description: role.description ?? '' });
    this.selectedPermissions = normalizeGroupedPermissionsForEdit(role.permissionCodes);
    if (role.isSystem) {
      this.roleForm.get('roleName')?.disable({ emitEvent: false });
    } else {
      this.roleForm.get('roleName')?.enable({ emitEvent: false });
    }
  }

  cancelRoleForm(): void {
    if (this.saving) return;
    this.view = 'roles-list';
    this.editingRoleId = null;
    this.roleForm.get('roleName')?.enable({ emitEvent: false });
    this.errorMessage = '';
  }

  togglePermission(code: string, checked: boolean): void {
    const group = PERMISSION_GROUP_CONFIG.find(g => g.fullAccessCode === code);
    if (group) {
      if (checked) {
        this.selectedPermissions.add(code);
        for (const child of group.childCodes) {
          this.selectedPermissions.delete(child);
        }
      } else {
        this.selectedPermissions.delete(code);
      }
      return;
    }

    if (isGroupedChildCode(code) && this.hasFullGroupAccess(getFullAccessParent(code)!)) {
      return;
    }

    if (checked) this.selectedPermissions.add(code);
    else this.selectedPermissions.delete(code);
  }

  toggleCategory(group: PermissionGroupView, checked: boolean): void {
    for (const p of group.items) {
      this.togglePermission(p.permissionCode, checked);
    }
  }

  isCategoryFullySelected(group: PermissionGroupView): boolean {
    return group.items.every(p => this.isPermissionChecked(p.permissionCode));
  }

  saveRole(): void {
    if (this.roleForm.invalid || this.selectedPermissions.size === 0) {
      this.roleForm.markAllAsTouched();
      if (this.selectedPermissions.size === 0) this.errorMessage = 'Select at least one permission.';
      return;
    }
    const v = this.roleForm.getRawValue();
    const body = {
      roleName: v.roleName,
      description: v.description || null,
      permissionCodes: stripGroupedChildrenWhenFullAccess(Array.from(this.selectedPermissions))
    };
    this.saving = true;
    this.message = '';
    this.errorMessage = '';
    const req = this.editingRoleId
      ? this.api.put(`/roles/${this.editingRoleId}`, { roleId: this.editingRoleId, ...body })
      : this.api.post('/roles', body);
    req.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.message = 'Role saved. Affected users must log in again for changes to apply.';
        this.view = 'roles-list';
        this.editingRoleId = null;
        this.roleForm.get('roleName')?.enable({ emitEvent: false });
        this.loadAll();
      },
      error: err => (this.errorMessage = getApiErrorMessage(err, 'Save failed.'))
    });
  }

  deleteRole(role: AppRole): void {
    if (role.isSystem) return;
    if (!confirm(`Delete role "${role.roleName}"?`)) return;
    this.api.delete(`/roles/${role.roleId}`).subscribe({
      next: () => {
        this.message = 'Role deleted.';
        this.loadAll();
      },
      error: err => (this.errorMessage = getApiErrorMessage(err, 'Delete failed.'))
    });
  }
}
