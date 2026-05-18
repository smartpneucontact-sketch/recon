const I18N = {
  en: {
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.name': 'Name',
    'auth.phone': 'Phone number',
    'auth.role': 'Role',

    'login.title': 'Sign in',
    'login.hint': 'Sign in with your email and password.',
    'login.submit': 'Sign in',
    'login.noAccount': 'No account?',
    'login.signupLink': 'Create one',
    'login.invalid': 'Email or password is incorrect.',
    'login.error': 'Could not sign in. Please try again.',

    'signup.title': 'Create account',
    'signup.hint': 'Pick the role that matches your job.',
    'signup.submit': 'Create account',
    'signup.passwordHint': 'At least 6 characters.',
    'signup.haveAccount': 'Already have an account?',
    'signup.loginLink': 'Sign in',
    'signup.emailTaken': 'An account with that email already exists.',
    'signup.invalidEmail': 'Please enter a valid email.',
    'signup.passwordShort': 'Password must be at least 6 characters.',
    'signup.roleRequired': 'Please choose a role.',
    'signup.error': 'Could not create account.',

    'role.manager': 'Manager',
    'role.sales': 'Sales',
    'role.recon': 'Recon',

    'users.title': 'Users',
    'users.empty': 'No users.',
    'users.edit': 'Edit',
    'users.editTitle': 'Edit user',
    'users.save': 'Save',
    'users.newPassword': 'New password (optional)',
    'users.passwordHint': 'Leave blank to keep the existing password.',
    'users.deleteConfirm': 'Delete user "{name}"?',
    'users.lastManager': 'Cannot remove the last manager.',
    'users.cannotDeleteSelf': 'You cannot delete your own account.',
    'users.you': 'you',

    'common.back': 'Back',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.confirm': 'Confirm',
    'common.loading': 'Loading…',
    'common.logout': 'Sign out',
    'common.logoutConfirm': 'Sign out?',
    'common.save': 'Save',

    'filter.pending': 'Pending',
    'filter.completed': 'Completed',
    'filter.all': 'All',
    'filter.allCategories': 'All',

    'category.delivery': 'Delivery',
    'category.trade_auction': 'Trade Auction',
    'category.service': 'Service',

    'status.pending': 'Pending',
    'status.completed': 'Completed',

    'dashboard.addCar': 'Add vehicle',
    'dashboard.empty': 'No vehicles.',
    'dashboard.nextInLine': 'Next in line',
    'dashboard.photos': 'photos',
    'dashboard.photo': 'photo',
    'dashboard.noPhotos': 'no photos',
    'dashboard.reorderError': 'Could not save the new order. Refreshing.',

    'addCar.title': 'New vehicle',
    'addCar.stock': 'Stock number',
    'addCar.scheduled': 'Scheduled date and time',
    'addCar.category': 'Category',
    'addCar.submit': 'Create',
    'addCar.stockRequired': 'Stock number is required.',
    'addCar.scheduleRequired': 'Please pick a date and time.',
    'addCar.scheduleInvalid': 'That date and time is not valid.',
    'addCar.categoryRequired': 'Please choose a category.',

    'detail.delete': 'Delete',
    'detail.deleteConfirm': 'Delete this vehicle and all its photos?',
    'detail.noPhotos': 'No attention zone photos yet.',
    'detail.addPhoto': 'Add attention zone photo',
    'detail.notePlaceholder': 'Describe what to clean / pay attention to…',
    'detail.upload': 'Upload',
    'detail.uploadError': 'Could not upload photo.',
    'detail.markDone': 'Mark cleaning as done',
    'detail.markDoneConfirm': 'Mark this cleaning job as done?',
    'detail.reopen': 'Reopen',
    'detail.removePhoto': 'Remove',
    'detail.removePhotoConfirm': 'Remove this photo?',
    'detail.noNote': 'No note',
    'detail.orderedAt': 'Ordered',
    'detail.orderedBy': 'Ordered by',
    'detail.scheduledAt': 'Scheduled',
    'detail.finishedAt': 'Finished',
    'detail.finishedBy': 'Finished by',
    'detail.duration': 'Turnaround',
    'detail.nextInLine': 'Next in line',
    'detail.nextInLineHint': 'Leave blank to use the schedule order.',
    'detail.nextInLineInvalid': 'Enter a whole number (1 or higher), or leave blank.',
    'detail.nextInLineSaved': 'Saved.',
    'detail.nextInLineError': 'Could not save.',
    'detail.auto': 'auto',

    'time.min': 'min',
    'time.h': 'h',
    'time.d': 'd',
  },
  es: {
    'auth.email': 'Correo',
    'auth.password': 'Contraseña',
    'auth.name': 'Nombre',
    'auth.phone': 'Teléfono',
    'auth.role': 'Rol',

    'login.title': 'Iniciar sesión',
    'login.hint': 'Inicia sesión con tu correo y contraseña.',
    'login.submit': 'Entrar',
    'login.noAccount': '¿No tienes cuenta?',
    'login.signupLink': 'Crear una',
    'login.invalid': 'Correo o contraseña incorrectos.',
    'login.error': 'No se pudo iniciar sesión. Inténtalo de nuevo.',

    'signup.title': 'Crear cuenta',
    'signup.hint': 'Elige el rol que coincide con tu trabajo.',
    'signup.submit': 'Crear cuenta',
    'signup.passwordHint': 'Al menos 6 caracteres.',
    'signup.haveAccount': '¿Ya tienes cuenta?',
    'signup.loginLink': 'Iniciar sesión',
    'signup.emailTaken': 'Ya existe una cuenta con ese correo.',
    'signup.invalidEmail': 'Introduce un correo válido.',
    'signup.passwordShort': 'La contraseña debe tener al menos 6 caracteres.',
    'signup.roleRequired': 'Elige un rol.',
    'signup.error': 'No se pudo crear la cuenta.',

    'role.manager': 'Gerente',
    'role.sales': 'Ventas',
    'role.recon': 'Limpieza',

    'users.title': 'Usuarios',
    'users.empty': 'Sin usuarios.',
    'users.edit': 'Editar',
    'users.editTitle': 'Editar usuario',
    'users.save': 'Guardar',
    'users.newPassword': 'Nueva contraseña (opcional)',
    'users.passwordHint': 'Déjalo en blanco para mantener la contraseña actual.',
    'users.deleteConfirm': '¿Eliminar al usuario "{name}"?',
    'users.lastManager': 'No se puede quitar al último gerente.',
    'users.cannotDeleteSelf': 'No puedes eliminar tu propia cuenta.',
    'users.you': 'tú',

    'common.back': 'Atrás',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.confirm': 'Confirmar',
    'common.loading': 'Cargando…',
    'common.logout': 'Cerrar sesión',
    'common.logoutConfirm': '¿Cerrar sesión?',
    'common.save': 'Guardar',

    'filter.pending': 'Pendientes',
    'filter.completed': 'Terminados',
    'filter.all': 'Todos',
    'filter.allCategories': 'Todas',

    'category.delivery': 'Entrega',
    'category.trade_auction': 'Subasta',
    'category.service': 'Servicio',

    'status.pending': 'Pendiente',
    'status.completed': 'Terminado',

    'dashboard.addCar': 'Añadir vehículo',
    'dashboard.empty': 'Sin vehículos.',
    'dashboard.nextInLine': 'Próximo en línea',
    'dashboard.photos': 'fotos',
    'dashboard.photo': 'foto',
    'dashboard.noPhotos': 'sin fotos',
    'dashboard.reorderError': 'No se pudo guardar el orden. Actualizando.',

    'addCar.title': 'Nuevo vehículo',
    'addCar.stock': 'Número de stock',
    'addCar.scheduled': 'Fecha y hora programada',
    'addCar.category': 'Categoría',
    'addCar.submit': 'Crear',
    'addCar.stockRequired': 'El número de stock es obligatorio.',
    'addCar.scheduleRequired': 'Elige una fecha y hora.',
    'addCar.scheduleInvalid': 'La fecha y hora no es válida.',
    'addCar.categoryRequired': 'Elige una categoría.',

    'detail.delete': 'Eliminar',
    'detail.deleteConfirm': '¿Eliminar este vehículo y todas sus fotos?',
    'detail.noPhotos': 'Aún no hay fotos de zonas de atención.',
    'detail.addPhoto': 'Añadir foto de zona de atención',
    'detail.notePlaceholder': 'Describe qué limpiar / a qué prestar atención…',
    'detail.upload': 'Subir',
    'detail.uploadError': 'No se pudo subir la foto.',
    'detail.markDone': 'Marcar limpieza como hecha',
    'detail.markDoneConfirm': '¿Marcar este trabajo de limpieza como hecho?',
    'detail.reopen': 'Reabrir',
    'detail.removePhoto': 'Quitar',
    'detail.removePhotoConfirm': '¿Quitar esta foto?',
    'detail.noNote': 'Sin nota',
    'detail.orderedAt': 'Pedido',
    'detail.orderedBy': 'Pedido por',
    'detail.scheduledAt': 'Programado',
    'detail.finishedAt': 'Terminado',
    'detail.finishedBy': 'Terminado por',
    'detail.duration': 'Tiempo total',
    'detail.nextInLine': 'Próximo en línea',
    'detail.nextInLineHint': 'Déjalo en blanco para usar el orden programado.',
    'detail.nextInLineInvalid': 'Introduce un número entero (1 o mayor), o déjalo en blanco.',
    'detail.nextInLineSaved': 'Guardado.',
    'detail.nextInLineError': 'No se pudo guardar.',
    'detail.auto': 'auto',

    'time.min': 'min',
    'time.h': 'h',
    'time.d': 'd',
  }
};

const i18n = {
  lang: localStorage.getItem('lang') || (navigator.language || 'en').slice(0, 2),
  setLang(l) {
    if (!I18N[l]) l = 'en';
    this.lang = l;
    localStorage.setItem('lang', l);
    document.documentElement.lang = l;
    this.apply();
  },
  t(key) {
    return (I18N[this.lang] && I18N[this.lang][key]) || I18N.en[key] || key;
  },
  apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = this.t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = this.t(el.getAttribute('data-i18n-placeholder'));
    });
  }
};
if (!I18N[i18n.lang]) i18n.lang = 'en';
