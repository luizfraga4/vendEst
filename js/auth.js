/**
 * Módulo de Autenticação e Níveis de Acesso (RBAC)
 * Sistema: VendEst PDV & Controle de Estoque
 * Perfis: Admin (Total), Operador (Apenas PDV e Comandas)
 */

class AuthModule {
  constructor() {
    this.currentUser = sessionStorage.getItem('vendest_user_role') || null;
    this.adminPassword = localStorage.getItem('vendest_admin_pwd') || '1234';
    this.pendingAdminAction = null;
  }

  init() {
    this.bindEvents();
    if (!this.currentUser) {
      this.showLoginModal();
    } else {
      this.applyRoleRestrictions();
    }
  }

  bindEvents() {
    // Esses modais serão adicionados no HTML
    const loginModal = document.getElementById('modal-login');
    const authAdminModal = document.getElementById('modal-auth-admin');

    if (document.getElementById('btn-login-operador')) {
      document.getElementById('btn-login-operador').addEventListener('click', () => this.login('operador'));
    }
    
    if (document.getElementById('btn-login-admin')) {
      document.getElementById('btn-login-admin').addEventListener('click', () => {
        const pwd = document.getElementById('login-admin-pwd').value;
        this.login('admin', pwd);
      });
    }

    if (document.getElementById('btn-auth-admin-confirm')) {
      document.getElementById('btn-auth-admin-confirm').addEventListener('click', () => {
        const pwd = document.getElementById('auth-admin-pwd').value;
        this.authorizeAdminAction(pwd);
      });
    }
  }

  showLoginModal() {
    const modal = document.getElementById('modal-login');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  login(role, pwd = '') {
    if (role === 'admin') {
      if (pwd !== this.adminPassword) {
        showToast('Senha de administrador incorreta.', 'error');
        return;
      }
    }
    
    this.currentUser = role;
    sessionStorage.setItem('vendest_user_role', role);
    
    const modal = document.getElementById('modal-login');
    if (modal) modal.classList.add('hidden');
    
    showToast(`Logado como ${role === 'admin' ? 'Administrador' : 'Operador'}`, 'success');
    this.applyRoleRestrictions();
    
    // Forçar aba do PDV ao logar
    if (window.appModule) {
      window.appModule.switchTab('pdv');
    }
  }

  logout() {
    this.currentUser = null;
    sessionStorage.removeItem('vendest_user_role');
    this.showLoginModal();
    this.applyRoleRestrictions();
  }

  applyRoleRestrictions() {
    const isAdmin = this.currentUser === 'admin';
    
    // Controle das abas do menu
    const tabs = ['stock', 'reports', 'backup', 'config'];
    tabs.forEach(tab => {
      const btn = document.getElementById(`btn-tab-${tab}`);
      if (btn) {
        if (isAdmin) {
          btn.style.display = 'flex';
        } else {
          btn.style.display = 'none';
        }
      }
    });

    // Atualiza a interface (mostrar/esconder perfil ativo, etc.)
    const userDisplay = document.getElementById('user-role-display');
    if (userDisplay) {
      userDisplay.innerHTML = isAdmin 
        ? `<i class="fa-solid fa-user-shield text-indigo-400 mr-2"></i> Administrador <button onclick="authModule.logout()" class="ml-2 text-xs text-rose-400 hover:text-rose-300 underline">Sair</button>`
        : `<i class="fa-solid fa-user text-slate-400 mr-2"></i> Operador <button onclick="authModule.logout()" class="ml-2 text-xs text-rose-400 hover:text-rose-300 underline">Sair</button>`;
    }
  }

  requireAdmin(actionCallback) {
    if (this.currentUser === 'admin') {
      actionCallback();
    } else {
      this.pendingAdminAction = actionCallback;
      const modal = document.getElementById('modal-auth-admin');
      if (modal) {
        document.getElementById('auth-admin-pwd').value = '';
        modal.classList.remove('hidden');
        document.getElementById('auth-admin-pwd').focus();
      }
    }
  }

  authorizeAdminAction(pwd) {
    if (pwd === this.adminPassword) {
      const modal = document.getElementById('modal-auth-admin');
      if (modal) modal.classList.add('hidden');
      
      if (this.pendingAdminAction) {
        this.pendingAdminAction();
        this.pendingAdminAction = null;
      }
    } else {
      showToast('Senha de administrador incorreta.', 'error');
    }
  }
  
  closeAuthAdminModal() {
    const modal = document.getElementById('modal-auth-admin');
    if (modal) modal.classList.add('hidden');
    this.pendingAdminAction = null;
  }

  updateAdminPassword(newPwd) {
    if (newPwd && newPwd.trim().length > 0) {
      this.adminPassword = newPwd.trim();
      localStorage.setItem('vendest_admin_pwd', this.adminPassword);
      showToast('Senha do administrador atualizada.', 'success');
    }
  }
}

const authModule = new AuthModule();
window.authModule = authModule;
