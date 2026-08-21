/**
 * Módulo Principal de Orquestração (App.js)
 * Sistema: VendEst PDV & Controle de Estoque (PDV_Estoque_DB)
 * Gerencia navegação entre abas, atalhos de teclado (F2, F4, ESC) e notificações Toast.
 */

// Notificações Toast Globais
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');

  const colors = {
    success: 'bg-emerald-900/90 text-emerald-200 border-emerald-500/50',
    error: 'bg-rose-900/90 text-rose-200 border-rose-500/50',
    warning: 'bg-amber-900/90 text-amber-200 border-amber-500/50',
    info: 'bg-indigo-900/90 text-indigo-200 border-indigo-500/50'
  };

  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
  };

  toast.className = `toast-slide flex items-center p-4 mb-2 rounded-xl shadow-lg border backdrop-blur-md text-sm font-medium ${colors[type] || colors.info}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} text-lg mr-3"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Navegação por Abas
function showTab(tabId) {
  const tabContents = document.querySelectorAll('.tab-content');
  tabContents.forEach(el => el.classList.add('hidden'));

  const tabButtons = document.querySelectorAll('.nav-tab-btn');
  tabButtons.forEach(btn => {
    btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-md');
    btn.classList.add('text-slate-400', 'hover:bg-slate-800', 'hover:text-slate-200');
  });

  const targetContent = document.getElementById(`tab-${tabId}`);
  if (targetContent) {
    targetContent.classList.remove('hidden');
  }

  const targetButton = document.getElementById(`btn-tab-${tabId}`);
  if (targetButton) {
    targetButton.classList.remove('text-slate-400', 'hover:bg-slate-800', 'hover:text-slate-200');
    targetButton.classList.add('bg-indigo-600', 'text-white', 'shadow-md');
  }

  if (tabId === 'pdv' && window.pdvModule) {
    window.pdvModule.focusScanInput();
  } else if (tabId === 'stock' && window.stockModule) {
    window.stockModule.loadProducts();
  } else if (tabId === 'reports' && window.reportsModule) {
    window.reportsModule.carregarRelatorioVendasUI();
  }
}

// Atalhos Globais de Teclado (F2, F4, ESC)
document.addEventListener('keydown', (e) => {
  if (e.key === 'F2') {
    e.preventDefault();
    showTab('pdv');
    if (window.pdvModule) {
      window.pdvModule.focusScanInput();
      showToast('Campo do Leitor PDV focado (F2)', 'info');
    }
  }

  if (e.key === 'F4') {
    e.preventDefault();
    showTab('pdv');
    if (window.pdvModule) {
      window.pdvModule.openPaymentModal();
    }
  }

  if (e.key === 'Escape') {
    const openModals = document.querySelectorAll('.modal-container:not(.hidden)');
    if (openModals.length > 0) {
      openModals.forEach(m => m.classList.add('hidden'));
      if (window.pdvModule) window.pdvModule.focusScanInput();
    } else {
      const pdvTab = document.getElementById('tab-pdv');
      if (pdvTab && !pdvTab.classList.contains('hidden')) {
        if (window.pdvModule && window.pdvModule.cart.length > 0) {
          if (confirm('Deseja cancelar a venda atual e limpar o carrinho?')) {
            window.pdvModule.clearCart();
          }
        }
      }
    }
  }
});

// Gestão de Configurações da Empresa
const appModule = {
  saveConfig: () => {
    const nome = document.getElementById('config-empresa-nome').value.trim();
    const cnpj = document.getElementById('config-empresa-cnpj').value.trim();
    const telefone = document.getElementById('config-empresa-telefone').value.trim();
    const endereco = document.getElementById('config-empresa-endereco').value.trim();

    const configData = { nome, cnpj, telefone, endereco };
    localStorage.setItem('empresa_pdv', JSON.stringify(configData));
    showToast('Dados da empresa salvos com sucesso!', 'success');
  },
  
  loadConfig: () => {
    const saved = localStorage.getItem('empresa_pdv');
    if (saved) {
      try {
        const configData = JSON.parse(saved);
        const nameEl = document.getElementById('config-empresa-nome');
        if (nameEl) nameEl.value = configData.nome || '';
        
        const cnpjEl = document.getElementById('config-empresa-cnpj');
        if (cnpjEl) cnpjEl.value = configData.cnpj || '';
        
        const telEl = document.getElementById('config-empresa-telefone');
        if (telEl) telEl.value = configData.telefone || '';
        
        const endEl = document.getElementById('config-empresa-endereco');
        if (endEl) endEl.value = configData.endereco || '';
      } catch (err) {
        console.error('Erro ao ler config da empresa', err);
      }
    }
  },

  switchTab: (tabId) => {
    showTab(tabId);
  }
};

window.appModule = appModule;

// Inicialização da Aplicação
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Inicializar Banco de Dados IndexedDB "PDV_Estoque_DB"
    await dbManager.init();

    // 2. Inicializar Módulos
    if (window.appModule) window.appModule.loadConfig();
    if (window.stockModule) await window.stockModule.init();
    if (window.pdvModule) await window.pdvModule.init();
    if (window.reportsModule) await window.reportsModule.init();

    // 3. Carregar e exibir a tabela de estoque e o relatório de vendas no arranque
    await dbManager.listarProdutos();
    if (window.reportsModule) {
      await window.reportsModule.carregarRelatorioVendasUI();
    }

    showTab('pdv');
    console.log('VendEst ("PDV_Estoque_DB") pronto para uso.');
  } catch (err) {
    console.error('Erro na inicialização da aplicação:', err);
    showToast('Erro ao inicializar o banco de dados do sistema.', 'error');
  }
});
