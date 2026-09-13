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
    this.currentEditingId = null;
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
    this.currentEditingId = productId;
    this.editingProductId = productId;
    const modal = document.getElementById('modal-product');
    const title = document.getElementById('modal-product-title');

    const formCodigo  = document.getElementById('product-code');
    const formNome    = document.getElementById('product-name');
    const formQtd     = document.getElementById('product-stock-qty');
    const formCusto   = document.getElementById('product-cost-price');
    const formVenda   = document.getElementById('product-sell-price');
    const formMin     = document.getElementById('product-min-stock-qty');
    const codeErrorEl = document.getElementById('product-code-error');

    // Limpa mensagem de erro anterior
    if (codeErrorEl) codeErrorEl.classList.add('hidden');

    if (productId) {
      // Editar produto existente
      const produtos = await dbManager.listarProdutos();
      const p = produtos.find(x => x.id === productId);
      if (p) {
        title.innerHTML = '<i class="fa-solid fa-pen text-indigo-400"></i> Editar Produto';
        formCodigo.value = p.codigo || p.code || '';
        formNome.value   = p.nome || p.name || '';
        this.populateCategorySelect(p.categoria || p.category || 'Geral');
        formQtd.value   = p.quantidade || p.estoque || p.stockQty || 0;
        formCusto.value = p.precoCusto || p.costPrice || 0;
        formVenda.value = p.precoVenda || p.sellPrice || 0;
        formMin.value   = p.estoqueMinimo || p.minStock || 5;
      }
    } else {
      // Novo produto: campo de código VAZIO — bipa ou deixa em branco para gerar auto no save
      title.innerHTML = '<i class="fa-solid fa-plus text-indigo-400"></i> Novo Produto';
      document.getElementById('form-product').reset();
      formMin.value = 5;
      this.populateCategorySelect();
      // formCodigo.value permanece '' após o reset — não preenche automaticamente
    }

    modal.classList.remove('hidden');
    // Foca no campo de código imediatamente (pronto para o leitor de código de barras)
    setTimeout(() => formCodigo.focus(), 80);
  }

  populateCategorySelect(selected = null) {
    const select = document.getElementById('product-category');
    if (!select) return;

    let options = '';

    // Se a categoria selecionada não estiver na lista global, adiciona temporariamente ao select
    let cats = [...(window.appModule ? window.appModule.categorias : ['Geral'])];
    if (selected && !cats.includes(selected)) {
      cats.push(selected);
    }

    cats.sort().forEach(c => {
      options += `<option value="${c}">${c}</option>`;
    });

    options += `<option value="+ Nova Categoria" class="font-bold text-indigo-400">+ Nova Categoria...</option>`;
    select.innerHTML = options;

    if (selected) {
      select.value = selected;
    }
  }

  handleCategoryChange(selectElement) {
    if (selectElement.value === '+ Nova Categoria') {
      const newCat = prompt('Digite o nome da nova categoria:');
      if (newCat && newCat.trim() !== '') {
        if (window.appModule) {
          window.appModule.addCategory(newCat.trim());
        }
      } else {
        selectElement.selectedIndex = 0;
      }
    }
  }

  closeProductModal() {
    const modal = document.getElementById('modal-product');
    if (modal) modal.classList.add('hidden');
    this.currentEditingId = null;
    this.editingProductId = null;
    const codeErrorEl = document.getElementById('product-code-error');
    if (codeErrorEl) codeErrorEl.classList.add('hidden');
  }

  /**
   * handleFormSubmit: salva produto com geração automática de código se campo em branco.
   *
   * Fluxo:
   *   - Código em branco → gera sequencial automático via obterProximoCodigoDisponivel()
   *   - Código preenchido (manual/bipado) → valida duplicidade antes de salvar
   */
  async handleFormSubmit(e) {
    if (e) e.preventDefault();

    const codigoInput = document.getElementById('product-code');
    const nomeInput   = document.getElementById('product-name');
    const codeErrorEl = document.getElementById('product-code-error');

    if (codeErrorEl) codeErrorEl.classList.add('hidden');

    let codigoInformado = codigoInput ? codigoInput.value.trim() : '';
    const nome = nomeInput ? nomeInput.value.trim() : '';

    let categoria = document.getElementById('product-category').value.trim();
    if (!categoria || categoria === '+ Nova Categoria') categoria = 'Geral';

    const precoCusto  = parseFloat(document.getElementById('product-cost-price').value)  || 0;
    const precoVenda  = parseFloat(document.getElementById('product-sell-price').value)  || 0;
    const quantidade  = parseInt(document.getElementById('product-stock-qty').value, 10) || 0;
    let estoqueMinimo = parseInt(document.getElementById('product-min-stock-qty').value, 10);
    if (isNaN(estoqueMinimo)) estoqueMinimo = 5;

    if (!nome) {
      showToast('Preencha pelo menos o Nome do produto.', 'warning');
      if (nomeInput) nomeInput.focus();
      return;
    }

    // --- Código em branco: gera automático no momento do save ---
    if (!codigoInformado) {
      try {
        codigoInformado = await dbManager.obterProximoCodigoDisponivel();
        if (codigoInput) codigoInput.value = codigoInformado; // Exibe o código gerado no campo
      } catch (err) {
        console.error('[StockModule] Falha ao gerar código automático:', err);
        showToast('Não foi possível gerar um código automático. Preencha o campo manualmente.', 'error');
        if (codigoInput) codigoInput.focus();
        return;
      }
    } else {
      // --- Código informado manualmente/bipado: valida duplicidade ---
      const existing = await dbManager.buscarProdutoPorCodigo(codigoInformado);
      const isConflito = existing && Number(existing.id) !== Number(this.editingProductId);
      if (isConflito) {
        const nomeConflito = existing.nome || existing.name || 'desconhecido';
        const mensagem = `O código "${codigoInformado}" já está em uso pelo produto "${nomeConflito}". Bipe outro código ou apague o campo para gerar automático.`;
        if (codeErrorEl) {
          const spanEl = codeErrorEl.querySelector('span');
          if (spanEl) spanEl.textContent = mensagem;
          else codeErrorEl.textContent = mensagem;
          codeErrorEl.classList.remove('hidden');
        } else {
          showToast(mensagem, 'error');
        }
        if (codigoInput) { codigoInput.focus(); codigoInput.select(); }
        return;
      }
    }

    const produtoData = {
      id: this.editingProductId || null,
      codigo: codigoInformado,
      nome,
      categoria,
      precoCusto,
      precoVenda,
      quantidade,
      estoqueMinimo
    };

    try {
      await dbManager.salvarProduto(produtoData);
      showToast(
        this.editingProductId
          ? 'Produto atualizado com sucesso!'
          : `Produto "${nome}" cadastrado com código ${codigoInformado}!`,
        'success'
      );
      this.closeProductModal();
      await this.loadProducts();
      if (window.pdvModule)      window.pdvModule.loadProductCatalog();
      if (window.comandasModule) window.comandasModule.loadCatalog();
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
