const I18N = {
  en: {
    'login.title': 'Sign in',
    'login.hint': 'Enter the manager or cleaning team password.',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.invalid': 'Invalid password.',
    'login.error': 'Could not sign in. Please try again.',

    'common.back': 'Back',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.confirm': 'Confirm',
    'common.loading': 'Loading…',
    'common.logout': 'Sign out',
    'common.logoutConfirm': 'Sign out?',

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
    'dashboard.empty': 'No vehicles to show.',
    'dashboard.photos': 'photos',
    'dashboard.photo': 'photo',
    'dashboard.noPhotos': 'no photos',

    'addCar.title': 'New vehicle',
    'addCar.stock': 'Stock number',
    'addCar.category': 'Category',
    'addCar.submit': 'Create',
    'addCar.stockRequired': 'Stock number is required.',
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
    'detail.completedOn': 'Completed',
    'detail.createdOn': 'Added',
  },
  es: {
    'login.title': 'Iniciar sesión',
    'login.hint': 'Introduce la contraseña del gerente o del equipo de limpieza.',
    'login.password': 'Contraseña',
    'login.submit': 'Entrar',
    'login.invalid': 'Contraseña no válida.',
    'login.error': 'No se pudo iniciar sesión. Inténtalo de nuevo.',

    'common.back': 'Atrás',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.confirm': 'Confirmar',
    'common.loading': 'Cargando…',
    'common.logout': 'Cerrar sesión',
    'common.logoutConfirm': '¿Cerrar sesión?',

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
    'dashboard.empty': 'No hay vehículos para mostrar.',
    'dashboard.photos': 'fotos',
    'dashboard.photo': 'foto',
    'dashboard.noPhotos': 'sin fotos',

    'addCar.title': 'Nuevo vehículo',
    'addCar.stock': 'Número de stock',
    'addCar.category': 'Categoría',
    'addCar.submit': 'Crear',
    'addCar.stockRequired': 'El número de stock es obligatorio.',
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
    'detail.completedOn': 'Terminado',
    'detail.createdOn': 'Añadido',
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
