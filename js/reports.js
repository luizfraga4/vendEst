/**
 * Módulo 3: Relatórios, Financeiro & Compras/Despesas
 * Sistema: VendEst PDV & Controle de Estoque
 * Exibe estatísticas de vendas (DRE Básico), histórico paginado, e gestão de Compras & Despesas.
 */

class ReportsModule {
  constructor() {
    this.vendas = [];
    this.compras = [];
    this.sangrias = [];
    this.currentPeriod = 'TODAY'; // Padrão inicial: Data Atual (Hoje)
    this.currentPage = 1;
    this.pageSize = 50;
    this.activeSubTab = 'sales'; // 'sales' | 'purchases'
  }

  async init() {
    this.bindEvents();
    await this.carregarRelatorioVendasUI();
  }

  bindEvents() {
    const todayStr = new Date().toISOString().substring(0, 10);
    const startDateInput = document.getElementById('report-start-date');
    const endDateInput = document.getElementById('report-end-date');
    if (startDateInput) startDateInput.value = todayStr;
    if (endDateInput) endDateInput.value = todayStr;
  }

  switchSubTab(tabName) {
    if (tabName === 'purchases') {
      if (window.authModule) {
        window.authModule.requireAdmin(() => {
          this.activeSubTab = 'purchases';
          this.updateSubTabUI();
        });
      } else {
        this.activeSubTab = 'purchases';
        this.updateSubTabUI();
      }
    } else {
      this.activeSubTab = 'sales';
      this.updateSubTabUI();
    }
  }

  updateSubTabUI() {
    const btnSales = document.getElementById('btn-subtab-sales');
    const btnPurchases = document.getElementById('btn-subtab-purchases');
    const containerSales = document.getElementById('subtab-sales-container');
    const containerPurchases = document.getElementById('subtab-purchases-container');

    if (this.activeSubTab === 'purchases') {
      if (btnSales) {
        btnSales.className = 'subtab-btn px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 cursor-pointer';
      }
      if (btnPurchases) {
        btnPurchases.className = 'subtab-btn px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all bg-indigo-600 text-white shadow-md cursor-pointer';
      }
      if (containerSales) containerSales.classList.add('hidden');
      if (containerPurchases) containerPurchases.classList.remove('hidden');
      this.renderizarComprasUI();
    } else {
      if (btnSales) {
        btnSales.className = 'subtab-btn px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all bg-indigo-600 text-white shadow-md cursor-pointer';
      }
      if (btnPurchases) {
        btnPurchases.className = 'subtab-btn px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 cursor-pointer';
      }
      if (containerSales) containerSales.classList.remove('hidden');
      if (containerPurchases) containerPurchases.classList.add('hidden');
      this.renderizarRelatorioVendas();
    }
  }

  setQuickPeriod(period) {
    this.currentPeriod = period;
    this.currentPage = 1;

    const allBtns = [
      { id: 'btn-filter-today', code: 'TODAY' },
      { id: 'btn-filter-week', code: 'WEEK' },
      { id: 'btn-filter-month', code: 'MONTH' },
      { id: 'btn-filter-custom', code: 'CUSTOM' }
    ];

    allBtns.forEach(item => {
      const el = document.getElementById(item.id);
      if (el) {
        if (item.code === period) {
          el.className = 'period-quick-btn px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-white cursor-pointer';
        } else {
          el.className = 'period-quick-btn px-3 py-1.5 rounded-xl text-xs font-semibold transition-all bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer';
        }
      }
    });

    const customContainer = document.getElementById('report-custom-date-container');
    if (customContainer) {
      if (period === 'CUSTOM') {
        customContainer.classList.remove('hidden');
      } else {
        customContainer.classList.add('hidden');
        this.carregarRelatorioVendasUI();
      }
    } else {
      this.carregarRelatorioVendasUI();
    }
  }

  applyCustomDateFilter() {
    this.currentPage = 1;
    this.carregarRelatorioVendasUI();
  }

  getDateRange() {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (this.currentPeriod === 'TODAY') {
      return { inicio: todayStr, fim: todayStr };
    } else if (this.currentPeriod === 'WEEK') {
      const past7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const past7Str = `${past7.getFullYear()}-${String(past7.getMonth() + 1).padStart(2, '0')}-${String(past7.getDate()).padStart(2, '0')}`;
      return { inicio: past7Str, fim: todayStr };
    } else if (this.currentPeriod === 'MONTH') {
      const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      return { inicio: monthStartStr, fim: todayStr };
    } else if (this.currentPeriod === 'CUSTOM') {
      const startEl = document.getElementById('report-start-date');
      const endEl = document.getElementById('report-end-date');
      const inicio = startEl && startEl.value ? startEl.value : todayStr;
      const fim = endEl && endEl.value ? endEl.value : todayStr;
      return { inicio, fim };
    }

    return { inicio: null, fim: null };
  }

  async carregarRelatorioVendasUI() {
    try {
      if (!window.dbManager || !window.dbManager.db) return;

      const { inicio, fim } = this.getDateRange();

      const dbVendas = await new Promise((resolve) => {
        const tx = window.dbManager.db.transaction('vendas', 'readonly');
        const store = tx.objectStore('vendas');
        const request = store.getAll();

        request.onsuccess = () => {
          let vendas = request.result || [];
          vendas.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

          if (inicio) {
            vendas = vendas.filter(v => {
              const dateStr = v.data ? String(v.data).substring(0, 10) : '';
              return dateStr >= inicio;
            });
          }
          if (fim) {
            vendas = vendas.filter(v => {
              const dateStr = v.data ? String(v.data).substring(0, 10) : '';
              return dateStr <= fim;
            });
          }
          resolve(vendas);
        };
        request.onerror = () => resolve([]);
      });

      this.vendas = dbVendas;
      this.compras = await window.dbManager.listarCompras(inicio, fim);
      this.sangrias = await window.dbManager.listarSangriasPorPeriodo(inicio, fim);

      this.atualizarDRE();
      
      if (this.activeSubTab === 'purchases') {
        this.renderizarComprasUI();
      } else {
        this.renderizarRelatorioVendas();
      }

    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
    }
  }

  atualizarDRE() {
    const totalRevenueEl = document.getElementById('report-total-revenue');
    const totalExpensesEl = document.getElementById('report-total-expenses');
    const netResultEl = document.getElementById('report-net-result');
    const netResultBox = document.getElementById('card-net-result-box');
    const netResultLabel = document.getElementById('report-net-result-label');
    const averageTicketEl = document.getElementById('report-average-ticket');
    const totalOrdersEl = document.getElementById('report-total-orders');
    const totalItemsSoldEl = document.getElementById('report-total-items-sold');

    const faturamentoBruto = this.vendas.reduce((sum, v) => sum + Number(v.total || 0), 0);
    const totalCompras = this.compras.reduce((sum, c) => sum + Number(c.valor || 0), 0);
    const totalSangrias = this.sangrias.reduce((sum, s) => sum + Number(s.valor || 0), 0);
    const totalDespesas = totalCompras + totalSangrias;
    const resultadoLiquido = faturamentoBruto - totalDespesas;

    const qtdVendas = this.vendas.length;
    const ticketMedio = qtdVendas > 0 ? (faturamentoBruto / qtdVendas) : 0;
    const totalItensVendidos = this.vendas.reduce((sum, v) => {
      if (!Array.isArray(v.itens)) return sum;
      return sum + v.itens.reduce((iSum, item) => iSum + (parseInt(item.qty || item.quantidade || 0, 10)), 0);
    }, 0);

    if (totalRevenueEl) totalRevenueEl.textContent = faturamentoBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (totalExpensesEl) totalExpensesEl.textContent = totalDespesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (totalOrdersEl) totalOrdersEl.textContent = qtdVendas;
    if (averageTicketEl) averageTicketEl.textContent = ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (totalItemsSoldEl) totalItemsSoldEl.textContent = totalItensVendidos;

    if (netResultEl) {
      netResultEl.textContent = resultadoLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    if (netResultBox) {
      if (resultadoLiquido >= 0) {
        netResultBox.className = 'bg-emerald-500/10 rounded-2xl p-5 border border-emerald-500/30 shadow-lg transition-colors';
        if (netResultEl) netResultEl.className = 'text-2xl font-black text-emerald-400';
        if (netResultLabel) netResultLabel.textContent = 'Lucro Operacional (+)';
      } else {
        netResultBox.className = 'bg-rose-500/10 rounded-2xl p-5 border border-rose-500/30 shadow-lg transition-colors';
        if (netResultEl) netResultEl.className = 'text-2xl font-black text-rose-400';
        if (netResultLabel) netResultLabel.textContent = 'Prejuízo Operacional (-)';
      }
    }
  }

  changeSalesPage(delta) {
    const totalPages = Math.max(1, Math.ceil(this.vendas.length / this.pageSize));
    const newPage = this.currentPage + delta;

    if (newPage >= 1 && newPage <= totalPages) {
      this.currentPage = newPage;
      this.renderizarRelatorioVendas();
    }
  }

  renderizarRelatorioVendas() {
    const tbody = document.getElementById('report-sales-table-body');
    const paginationInfoEl = document.getElementById('sales-pagination-info');
    const pageNumberEl = document.getElementById('sales-page-number');
    const btnPrev = document.getElementById('btn-sales-prev');
    const btnNext = document.getElementById('btn-sales-next');

    if (!tbody) return;
    tbody.innerHTML = '';

    const totalVendas = this.vendas.length;
    const totalPages = Math.max(1, Math.ceil(totalVendas / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const startIdx = (this.currentPage - 1) * this.pageSize;
    const endIdx = startIdx + this.pageSize;
    const pagedVendas = this.vendas.slice(startIdx, endIdx);

    if (paginationInfoEl) {
      if (totalVendas === 0) {
        paginationInfoEl.textContent = 'Exibindo 0 vendas';
      } else {
        const displayStart = startIdx + 1;
        const displayEnd = Math.min(endIdx, totalVendas);
        paginationInfoEl.textContent = `Exibindo ${displayStart}-${displayEnd} de ${totalVendas} venda(s)`;
      }
    }

    if (pageNumberEl) pageNumberEl.textContent = `Página ${this.currentPage} de ${totalPages}`;
    if (btnPrev) btnPrev.disabled = (this.currentPage <= 1);
    if (btnNext) btnNext.disabled = (this.currentPage >= totalPages);

    if (!pagedVendas || pagedVendas.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-8 text-center text-slate-400">
            <i class="fa-solid fa-receipt text-4xl text-slate-500 mb-2 block"></i>
            <p class="font-medium text-slate-300">Nenhuma venda registrada no período selecionado.</p>
          </td>
        </tr>
      `;
      return;
    }

    const methodBadges = {
      'DINHEIRO': '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Dinheiro</span>',
      'PIX': '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">PIX</span>',
      'CREDITO': '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">Crédito</span>',
      'DEBITO': '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">Débito</span>'
    };

    tbody.innerHTML = pagedVendas.map(venda => {
      const qtdItens = Array.isArray(venda.itens) ? venda.itens.reduce((acc, item) => acc + (parseInt(item.qty || item.quantidade || 0, 10)), 0) : 0;
      const dataFormatada = venda.data ? new Date(venda.data).toLocaleString('pt-BR') : '';

      return `
        <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-800/60 text-sm">
          <td class="px-6 py-4 font-mono font-medium text-indigo-300">${venda.code || ''}</td>
          <td class="px-6 py-4 text-slate-300">${dataFormatada}</td>
          <td class="px-6 py-4">${methodBadges[venda.formaPagamento] || venda.formaPagamento}</td>
          <td class="px-6 py-4 text-slate-300">${qtdItens} item(ns)</td>
          <td class="px-6 py-4 font-bold text-emerald-400">R$ ${Number(venda.total || 0).toFixed(2)}</td>
          <td class="px-6 py-4 text-right space-x-2">
            <button onclick="reportsModule.viewSaleDetail(${venda.id})" class="text-indigo-400 hover:text-indigo-300 p-1.5 rounded hover:bg-indigo-500/10 transition-colors cursor-pointer" title="Ver Detalhes">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button onclick="reportsModule.reprintReceipt(${venda.id})" class="text-slate-400 hover:text-slate-200 p-1.5 rounded hover:bg-slate-500/10 transition-colors cursor-pointer" title="Imprimir Recibo">
              <i class="fa-solid fa-print"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // --- MÓDULO COMPRAS & DESPESAS ---

  renderizarComprasUI() {
    const tbody = document.getElementById('purchases-table-body');
    if (!tbody) return;

    if (!this.compras || this.compras.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-8 text-center text-slate-400">
            <i class="fa-solid fa-cart-flatbed text-4xl text-slate-500 mb-2 block"></i>
            <p class="font-medium text-slate-300">Nenhuma compra ou despesa lançada no período.</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.compras.map(c => {
      const dataFormatada = c.data ? new Date(c.data).toLocaleString('pt-BR') : '';
      return `
        <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-800/60 text-sm">
          <td class="px-6 py-4 text-slate-300">${dataFormatada}</td>
          <td class="px-6 py-4">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              ${c.categoria || 'Outros'}
            </span>
          </td>
          <td class="px-6 py-4 font-medium text-slate-100">${c.descricao || c.fornecedor || '-'}</td>
          <td class="px-6 py-4 text-slate-300">${c.formaPagamento || 'Dinheiro'}</td>
          <td class="px-6 py-4 font-bold text-rose-400">R$ ${Number(c.valor || 0).toFixed(2)}</td>
          <td class="px-6 py-4 text-right">
            <button onclick="reportsModule.deleteCompra(${c.id})" class="text-rose-400 hover:text-rose-300 p-1.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer" title="Excluir Despesa">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  openCompraModal() {
    const action = () => {
      const modal = document.getElementById('modal-compra-despesa');
      if (modal) {
        document.getElementById('compra-desc').value = '';
        document.getElementById('compra-cat').value = 'Reposição de Estoque';
        document.getElementById('compra-pay').value = 'Dinheiro';
        document.getElementById('compra-valor').value = '';
        modal.classList.remove('hidden');
        setTimeout(() => document.getElementById('compra-desc').focus(), 100);
      }
    };

    if (window.authModule) {
      window.authModule.requireAdmin(action);
    } else {
      action();
    }
  }

  closeCompraModal() {
    const modal = document.getElementById('modal-compra-despesa');
    if (modal) modal.classList.add('hidden');
  }

  async saveCompra() {
    const action = async () => {
      const descInput = document.getElementById('compra-desc');
      const catInput = document.getElementById('compra-cat');
      const payInput = document.getElementById('compra-pay');
      const valorInput = document.getElementById('compra-valor');

      const descricao = descInput ? descInput.value.trim() : '';
      const categoria = catInput ? catInput.value : 'Outros';
      const formaPagamento = payInput ? payInput.value : 'Dinheiro';
      const valor = valorInput ? parseFloat(valorInput.value) : 0;

      if (!descricao) {
        showToast('Informe a descrição ou fornecedor da compra/despesa.', 'warning');
        return;
      }

      if (isNaN(valor) || valor <= 0) {
        showToast('Informe um valor válido para a compra/despesa.', 'error');
        return;
      }

      try {
        await window.dbManager.salvarCompra({
          descricao,
          fornecedor: descricao,
          categoria,
          formaPagamento,
          valor,
          criadoPor: window.authModule ? window.authModule.currentUser : 'Admin'
        });

        showToast('Compra/Despesa lançada com sucesso!', 'success');
        this.closeCompraModal();
        await this.carregarRelatorioVendasUI();
      } catch (err) {
        console.error(err);
        showToast('Erro ao salvar compra/despesa.', 'error');
      }
    };

    if (window.authModule) {
      window.authModule.requireAdmin(action);
    } else {
      await action();
    }
  }

  async deleteCompra(id) {
    const action = async () => {
      if (!confirm('Deseja realmente EXCLUIR este lançamento de compra/despesa?')) return;

      try {
        await window.dbManager.excluirCompra(id);
        showToast('Compra/Despesa excluída com sucesso!', 'success');
        await this.carregarRelatorioVendasUI();
      } catch (err) {
        console.error(err);
        showToast('Erro ao excluir compra/despesa.', 'error');
      }
    };

    if (window.authModule) {
      window.authModule.requireAdmin(action);
    } else {
      await action();
    }
  }

  async viewSaleDetail(saleId) {
    const sale = this.vendas.find(s => s.id === saleId);
    if (!sale) return;

    const modal = document.getElementById('modal-sale-detail');
    const container = document.getElementById('sale-detail-content');

    if (!modal || !container) return;

    const dataFormatada = sale.data ? new Date(sale.data).toLocaleString('pt-BR') : '';
    const hasPagamentosList = Array.isArray(sale.pagamentos) && sale.pagamentos.length > 0;

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-between items-center border-b border-slate-700 pb-3">
          <div>
            <h3 class="text-lg font-bold text-slate-100">${sale.code || ''}</h3>
            <p class="text-xs text-slate-400">${dataFormatada}</p>
          </div>
          <span class="text-sm font-semibold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
            ${sale.formaPagamento || 'Venda'}
          </span>
        </div>

        ${hasPagamentosList ? `
          <div class="space-y-1">
            <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Formas de Pagamento</h4>
            <div class="bg-slate-900 rounded-lg p-2.5 space-y-1 border border-slate-800 text-xs">
              ${sale.pagamentos.map(p => `
                <div class="flex justify-between items-center text-slate-300">
                  <span>• ${p.forma}</span>
                  <span class="font-bold text-emerald-400">R$ ${Number(p.valor).toFixed(2)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${sale.observacao ? `
          <div class="bg-indigo-950/40 border border-indigo-500/30 rounded-lg p-3 text-xs">
            <p class="font-bold text-indigo-300 mb-1 flex items-center gap-1">
              <i class="fa-solid fa-comment-dots"></i> Observação da Venda:
            </p>
            <p class="text-slate-200 whitespace-pre-wrap">${sale.observacao}</p>
          </div>
        ` : ''}

        <div class="space-y-2">
          <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Itens do Pedido</h4>
          <div class="bg-slate-900 rounded-lg p-3 space-y-2 border border-slate-800 max-h-48 overflow-y-auto">
            ${(sale.itens || []).map(item => `
              <div class="flex justify-between items-center text-sm py-1 border-b border-slate-800/60 last:border-0">
                <div>
                  <p class="font-semibold text-slate-200">${item.name}</p>
                  <p class="text-xs text-slate-400 font-mono">${item.qty}x R$ ${item.price.toFixed(2)}</p>
                </div>
                <span class="font-bold text-emerald-400">R$ ${item.total.toFixed(2)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="bg-slate-900 rounded-lg p-3 space-y-1 text-sm border border-slate-800">
          <div class="flex justify-between text-slate-400">
            <span>Subtotal:</span>
            <span>R$ ${(sale.subtotal || sale.total).toFixed(2)}</span>
          </div>
          ${sale.desconto > 0 ? `
            <div class="flex justify-between text-rose-400">
              <span>Desconto:</span>
              <span>- R$ ${sale.desconto.toFixed(2)}</span>
            </div>
          ` : ''}
          <div class="flex justify-between font-bold text-base text-slate-100 border-t border-slate-800 pt-2">
            <span>Total da Venda:</span>
            <span class="text-emerald-400">R$ ${Number(sale.total).toFixed(2)}</span>
          </div>
          <div class="flex justify-between text-xs text-slate-400 pt-1">
            <span>Valor Recebido / Pago:</span>
            <span>R$ ${(sale.valorRecebido || sale.total).toFixed(2)}</span>
          </div>
          <div class="flex justify-between text-xs text-slate-400">
            <span>Troco:</span>
            <span>R$ ${(sale.troco || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  }

  closeSaleDetailModal() {
    const modal = document.getElementById('modal-sale-detail');
    if (modal) modal.classList.add('hidden');
  }

  reprintReceipt(saleId) {
    const sale = this.vendas.find(s => s.id === saleId);
    if (sale && window.pdvModule) {
      window.pdvModule.openReceiptModal(sale);
    }
  }
}

// Funções globais conforme solicitado
async function carregarRelatorioVendas(filtroData = null) {
  return await dbManager.carregarRelatorioVendas(filtroData);
}

const reportsModule = new ReportsModule();
window.reportsModule = reportsModule;

