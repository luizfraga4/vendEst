/**
 * Módulo 1: Gestão de Estoque
 * Sistema: VendEst PDV & Controle de Estoque
 * Responsável pelo cadastro, edição, exclusão e listagem de produtos no store 'produtos'.
 */

class StockModule {
  constructor() {
    this.products = [];
    this.searchTerm = '';
    this.selectedCategory = 'ALL';
    this.editingProductId = null;
  }

  async init() {
    this.bindEvents();
    await this.loadProducts();
  }

  bindEvents() {
    const searchInput = document.getElementById('stock-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchTerm = e.target.value.toLowerCase().trim();
        this.renderizarTabelaEstoque(this.products);
      });
    }

    const categorySelect = document.getElementById('stock-category-filter');
    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        this.selectedCategory = e.target.value;
        this.renderizarTabelaEstoque(this.products);
      });
    }
  }

  /**
   * Carrega produtos do store 'produtos' no IndexedDB
   */
  async loadProducts() {
    try {
      this.products = await dbManager.listarProdutos();
      this.updateCategoryOptions();
      this.renderizarTabelaEstoque(this.products);
    } catch (err) {
      console.error('Erro ao carregar lista de produtos:', err);
    }
  }

  updateCategoryOptions() {
    const categorySelect = document.getElementById('stock-category-filter');
    if (!categorySelect) return;

    const categories = Array.from(new Set(this.products.map(p => p.categoria || p.category || 'Geral')));

    let html = `<option value="ALL">Todas as Categorias</option>`;
    categories.forEach(cat => {
      html += `<option value="${cat}" ${this.selectedCategory === cat ? 'selected' : ''}>${cat}</option>`;
    });

    categorySelect.innerHTML = html;
  }

  /**
   * renderizarTabelaEstoque(produtos): Renderiza no HTML a lista de produtos
   */
  renderizarTabelaEstoque(produtos = this.products) {
    this.products = produtos;
    const tbody = document.getElementById('stock-table-body');
    if (!tbody) return;

    // Escapa caracteres especiais para evitar quebras de HTML
    const esc = (str) => String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const filtered = produtos.filter(p => {
      if (!p) return false;
      const codigo = String(p.codigo || p.code || '');
      const nome = String(p.nome || p.name || '');
      const cat = p.categoria || p.category || 'Geral';

      const matchesSearch = nome.toLowerCase().includes(this.searchTerm) ||
                            codigo.toLowerCase().includes(this.searchTerm);
      const matchesCat = this.selectedCategory === 'ALL' || cat === this.selectedCategory;
      return matchesSearch && matchesCat;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="px-6 py-8 text-center text-slate-400">
            <div class="flex flex-col items-center justify-center space-y-2">
              <i class="fa-solid fa-box-open text-4xl text-slate-500"></i>
              <p class="text-base font-medium">Nenhum produto cadastrado</p>
              <p class="text-xs text-slate-500">Clique em "Novo Produto" para adicionar um item ao estoque.</p>
            </div>
          </td>
        </tr>
      `;
      this.updateStockKPIs(produtos);
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      if (!p) return '';
      const codigo = esc(p.codigo || p.code || '');
      const nome = esc(p.nome || p.name || '');
      const cat = esc(p.categoria || p.category || 'Geral');
      const precoCusto = parseFloat(p.precoCusto || p.costPrice || 0);
      const precoVenda = parseFloat(p.precoVenda || p.sellPrice || 0);
      const estoque = parseInt(p.quantidade || p.estoque || p.stockQty || 0, 10);
      const estoqueMinimo = parseInt(p.estoqueMinimo || 5, 10);
      const isLowStock = estoque <= estoqueMinimo;
      const pid = Number(p.id);

      return `
        <tr class="hover:bg-slate-800/50 transition-colors border-b border-slate-800/60 text-sm">
          <td class="px-6 py-4 font-mono font-medium text-indigo-300 select-all">${codigo}</td>
          <td class="px-6 py-4 font-semibold text-slate-100">${nome}</td>
          <td class="px-6 py-4">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
              ${cat}
            </span>
          </td>
          <td class="px-6 py-4 text-slate-400">R$ ${precoCusto.toFixed(2)}</td>
          <td class="px-6 py-4 font-semibold text-emerald-400">R$ ${precoVenda.toFixed(2)}</td>
          <td class="px-6 py-4">
            <div class="flex items-center space-x-2">
              <span class="font-bold ${isLowStock ? 'text-amber-400' : 'text-slate-200'}">${estoque} un</span>
              ${isLowStock ? `
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <i class="fa-solid fa-triangle-exclamation mr-1"></i> Baixo
                </span>
              ` : ''}
            </div>
          </td>
          <td class="px-6 py-4 text-right space-x-2">
            <button onclick="stockModule.openProductModal(${pid})" class="text-indigo-400 hover:text-indigo-300 p-1.5 rounded-lg hover:bg-indigo-500/10 transition-colors" title="Editar Produto">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button onclick="stockModule.confirmExcluirProduto(${pid}, ${JSON.stringify(String(p.nome || p.name || ''))})" class="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors" title="Excluir Produto">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    this.updateStockKPIs(produtos);
  }

  updateStockKPIs(produtos) {
    const totalItemsEl = document.getElementById('kpi-total-items');
    const lowStockCountEl = document.getElementById('kpi-low-stock-count');
    const stockTotalValueEl = document.getElementById('kpi-stock-total-value');

    const validProdutos = produtos.filter(p => p != null);
    const totalProducts = validProdutos.length;
    const lowStockCount = validProdutos.filter(p => {
      const q = (p.quantidade || p.estoque || p.stockQty || 0);
      const min = parseInt(p.estoqueMinimo || 5, 10);
      return q <= min;
    }).length;
    const totalValue = validProdutos.reduce((acc, p) => acc + ((p.precoVenda || p.sellPrice || 0) * (p.quantidade || p.estoque || p.stockQty || 0)), 0);

    if (totalItemsEl) totalItemsEl.textContent = totalProducts;
    if (lowStockCountEl) lowStockCountEl.textContent = lowStockCount;
    if (stockTotalValueEl) stockTotalValueEl.textContent = totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  async openProductModal(productId = null) {
    this.editingProductId = productId;
    const modal = document.getElementById('modal-product');
    const modalTitle = document.getElementById('modal-product-title');
    const form = document.getElementById('form-product');

    if (!modal || !form) return;

    form.reset();

    if (productId) {
      modalTitle.textContent = 'Editar Produto';
      const produtos = await dbManager.listarProdutos();
      const p = produtos.find(item => item.id === productId);
      if (p) {
        document.getElementById('product-code').value = p.codigo || p.code || '';
        document.getElementById('product-name').value = p.nome || p.name || '';
        document.getElementById('product-category').value = p.categoria || p.category || '';
        document.getElementById('product-cost-price').value = p.precoCusto || p.costPrice || 0;
        document.getElementById('product-sell-price').value = p.precoVenda || p.sellPrice || 0;
        document.getElementById('product-stock-qty').value = p.quantidade || p.estoque || p.stockQty || 0;
        document.getElementById('product-min-stock-qty').value = p.estoqueMinimo || 5;
      }
    } else {
      modalTitle.textContent = 'Novo Produto';
      document.getElementById('product-min-stock-qty').value = 5;
    }

    modal.classList.remove('hidden');
    document.getElementById('product-code').focus();
  }

  closeProductModal() {
    const modal = document.getElementById('modal-product');
    if (modal) modal.classList.add('hidden');
    this.editingProductId = null;
  }

  async handleFormSubmit(e) {
    if (e) e.preventDefault();

    const codigo = document.getElementById('product-code').value.trim();
    const nome = document.getElementById('product-name').value.trim();
    const categoria = document.getElementById('product-category').value.trim() || 'Geral';
    const precoCusto = parseFloat(document.getElementById('product-cost-price').value) || 0;
    const precoVenda = parseFloat(document.getElementById('product-sell-price').value) || 0;
    const quantidade = parseInt(document.getElementById('product-stock-qty').value, 10) || 0;
    let estoqueMinimo = parseInt(document.getElementById('product-min-stock-qty').value, 10);
    if (isNaN(estoqueMinimo)) estoqueMinimo = 5;

    if (!codigo || !nome) {
      showToast('Preencha pelo menos o Código e o Nome do produto.', 'warning');
      return;
    }

    const existing = await dbManager.buscarProdutoPorCodigo(codigo);
    if (existing && existing.id !== this.editingProductId) {
      showToast(`Já existe um produto com o Código / SKU "${codigo}".`, 'error');
      return;
    }

    const produtoData = {
      id: this.editingProductId,
      codigo,
      nome,
      categoria,
      precoCusto,
      precoVenda,
      quantidade,
      estoqueMinimo
    };

    try {
      await dbManager.salvarProduto(produtoData);
      showToast(this.editingProductId ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!', 'success');
      this.closeProductModal();
      await this.loadProducts();

      if (window.pdvModule) {
        window.pdvModule.loadProductCatalog();
      }
    } catch (err) {
      console.error('Erro ao salvar produto:', err);
      showToast('Erro ao salvar produto no banco de dados local.', 'error');
    }
  }

  async confirmExcluirProduto(id, productName) {
    if (confirm(`Tem certeza que deseja excluir o produto "${productName}"?`)) {
      try {
        await dbManager.excluirProduto(id);
        showToast('Produto excluído com sucesso.', 'success');
        await this.loadProducts();

        if (window.pdvModule) {
          window.pdvModule.loadProductCatalog();
        }
      } catch (err) {
        console.error('Erro ao excluir produto:', err);
        showToast('Erro ao excluir produto.', 'error');
      }
    }
  }
}

// Função global solicitada para renderizar tabela de estoque diretamente
function renderizarTabelaEstoque(produtos) {
  if (window.stockModule) {
    window.stockModule.renderizarTabelaEstoque(produtos);
  }
}

// Instância global do módulo de estoque
const stockModule = new StockModule();
window.stockModule = stockModule;
