/**
 * Módulo 3: Relatórios e Fechamento de Caixa
 * Sistema: VendEst PDV & Controle de Estoque
 * Exibe estatísticas de vendas (Faturamento Total, Ticket Médio, Qtd Vendas) e histórico com filtro por data.
 */

class ReportsModule {
  constructor() {
    this.vendas = [];
    this.currentPeriod = 'ALL';
  }

  async init() {
    this.bindEvents();
    await this.carregarRelatorioVendasUI();
  }

  bindEvents() {
    const periodSelect = document.getElementById('report-period-filter');
    if (periodSelect) {
      periodSelect.addEventListener('change', (e) => {
        this.currentPeriod = e.target.value;
        const customDateBox = document.getElementById('report-custom-date-container');
        if (customDateBox) {
          if (this.currentPeriod === 'CUSTOM') {
            customDateBox.classList.remove('hidden');
          } else {
            customDateBox.classList.add('hidden');
            this.carregarRelatorioVendasUI();
          }
        } else {
          this.carregarRelatorioVendasUI();
        }
      });
    }

    const btnFilterCustom = document.getElementById('btn-apply-custom-date');
    if (btnFilterCustom) {
      btnFilterCustom.addEventListener('click', () => this.carregarRelatorioVendasUI());
    }
  }

  /**
   * carregarRelatorioVendasUI(): Executa o carregamento das vendas com base no filtro da UI
   */
  async carregarRelatorioVendasUI() {
    try {
      let filtroData = null;

      if (this.currentPeriod === 'TODAY') {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        filtroData = `${year}-${month}-${day}`; // Formato YYYY-MM-DD
      } else if (this.currentPeriod === 'CUSTOM') {
        const startDateInput = document.getElementById('report-start-date');
        if (startDateInput && startDateInput.value) {
          filtroData = startDateInput.value;
        }
      }

      if (!window.dbManager || !window.dbManager.db) return;

      // 1. Abra uma transação readonly no store vendas e use store.getAll()
      const tx = window.dbManager.db.transaction('vendas', 'readonly');
      const store = tx.objectStore('vendas');
      const request = store.getAll();

      request.onsuccess = (event) => {
        // 2. Capture o array retornado
        let vendas = event.target.result || [];
        vendas.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        // 3. Se houver filtro de data, normalize para YYYY-MM-DD
        if (filtroData && String(filtroData).trim() !== '') {
          const dataFiltro = String(filtroData).trim();
          vendas = vendas.filter(venda => {
             return venda.data && typeof venda.data === 'string' && venda.data.substring(0, 10) === dataFiltro;
          });
        }
        
        this.vendas = vendas;
        this.renderizarRelatorioVendas(this.vendas);
      };

      request.onerror = (e) => {
        console.error('Erro ao buscar relatório:', e.target.error);
      };
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
    }
  }

  /**
   * Renderiza as linhas na tabela de histórico e atualiza os cards
   */
  renderizarRelatorioVendas(vendas = this.vendas) {
    const tbody = document.getElementById('report-sales-table-body');
    const totalRevenueEl = document.getElementById('report-total-revenue');
    const totalOrdersEl = document.getElementById('report-total-orders');
    const averageTicketEl = document.getElementById('report-average-ticket');
    const totalItemsSoldEl = document.getElementById('report-total-items-sold');

    if (!tbody) return;

    // 4. Limpe o innerHTML da tabela do relatório antes de desenhar.
    tbody.innerHTML = '';

    // 6. Calcule a soma dos totais e atualize os cards numéricos da tela
    const faturamentoTotal = vendas.reduce((sum, v) => sum + Number(v.total || 0), 0);
    const qtdVendas = vendas.length;
    const ticketMedio = qtdVendas > 0 ? (faturamentoTotal / qtdVendas) : 0;
    const totalItensVendidos = vendas.reduce((sum, v) => {
      if (!Array.isArray(v.itens)) return sum;
      return sum + v.itens.reduce((iSum, item) => iSum + (parseInt(item.qty || item.quantidade || 0, 10)), 0);
    }, 0);

    if (totalRevenueEl) totalRevenueEl.textContent = faturamentoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (totalOrdersEl) totalOrdersEl.textContent = qtdVendas;
    if (averageTicketEl) averageTicketEl.textContent = ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (totalItemsSoldEl) totalItemsSoldEl.textContent = totalItensVendidos;

    if (!vendas || vendas.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-8 text-center text-slate-400">
            <i class="fa-solid fa-receipt text-4xl text-slate-500 mb-2 block"></i>
            <p class="font-medium text-slate-300">Nenhuma venda registrada no período.</p>
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

    // 5. Itere sobre a lista de vendas e insira as linhas <tr>
    tbody.innerHTML = vendas.map(venda => {
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
            <button onclick="reportsModule.viewSaleDetail(${venda.id})" class="text-indigo-400 hover:text-indigo-300 p-1.5 rounded hover:bg-indigo-500/10 transition-colors" title="Ver Detalhes">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button onclick="reportsModule.reprintReceipt(${venda.id})" class="text-slate-400 hover:text-slate-200 p-1.5 rounded hover:bg-slate-500/10 transition-colors" title="Imprimir Recibo">
              <i class="fa-solid fa-print"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async viewSaleDetail(saleId) {
    const sale = this.vendas.find(s => s.id === saleId);
    if (!sale) return;

    const modal = document.getElementById('modal-sale-detail');
    const container = document.getElementById('sale-detail-content');

    if (!modal || !container) return;

    const dataFormatada = sale.data ? new Date(sale.data).toLocaleString('pt-BR') : '';

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-between items-center border-b border-slate-700 pb-3">
          <div>
            <h3 class="text-lg font-bold text-slate-100">${sale.code || ''}</h3>
            <p class="text-xs text-slate-400">${dataFormatada}</p>
          </div>
          <span class="text-sm font-semibold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
            Forma: ${sale.formaPagamento}
          </span>
        </div>

        <div class="space-y-2">
          <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Itens do Pedido</h4>
          <div class="bg-slate-900 rounded-lg p-3 space-y-2 border border-slate-800">
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
            <span>Valor Recebido:</span>
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
