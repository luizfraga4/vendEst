/**
 * Módulo 2: Frente de Caixa (PDV)
 * Sistema: VendEst PDV & Controle de Estoque
 * Bípagem com leitor USB barcode, carrinho dinâmico, troco automático e baixa de estoque no store 'vendas' e 'produtos'.
 */

class PDVModule {
  constructor() {
    this.cart = [];
    this.catalog = [];
    this.selectedPaymentMethod = 'DINHEIRO';
    this.discount = 0;
    this.lastCompletedSale = null;
  }

  async init() {
    this.checkRegisterStatus();
    this.bindEvents();
    await this.loadProductCatalog();
    this.focusScanInput();
  }

  // --- CONTROLE DE CAIXA ---
  checkRegisterStatus() {
    const isAberto = localStorage.getItem('vendest_caixa_aberto') === 'true';
    const overlay = document.getElementById('caixa-closed-overlay');
    if (overlay) {
      if (isAberto) {
        overlay.classList.add('hidden');
      } else {
        overlay.classList.remove('hidden');
      }
    }
    return isAberto;
  }

  openCashRegisterModal() {
    const modal = document.getElementById('modal-cash-open');
    if (modal) {
      modal.classList.remove('hidden');
      setTimeout(() => document.getElementById('cash-open-amount').focus(), 100);
    }
  }

  closeCashRegisterModal() {
    const modalOpen = document.getElementById('modal-cash-open');
    if (modalOpen) modalOpen.classList.add('hidden');

    const modalClose = document.getElementById('modal-cash-close');
    if (modalClose) modalClose.classList.add('hidden');
  }

  openRegister() {
    const amount = parseFloat(document.getElementById('cash-open-amount').value) || 0;
    localStorage.setItem('vendest_caixa_aberto', 'true');
    localStorage.setItem('vendest_caixa_fundo', amount.toString());
    localStorage.setItem('vendest_caixa_abertura_ts', Date.now().toString());
    this.closeCashRegisterModal();
    this.checkRegisterStatus();
    showToast('Caixa aberto com sucesso! Turno iniciado.', 'success');
  }

  async closeRegisterModal() {
    if (!this.checkRegisterStatus()) {
      showToast('O caixa já está fechado.', 'warning');
      return;
    }
    
    // Obter dados do turno
    const fundo = parseFloat(localStorage.getItem('vendest_caixa_fundo')) || 0;
    const aberturaTs = parseInt(localStorage.getItem('vendest_caixa_abertura_ts'), 10) || 0;
    
    // Recuperar vendas a partir do momento de abertura
    let vendas = [];
    try {
      const dbVendas = await dbManager.carregarRelatorioVendas();
      vendas = dbVendas.filter(v => new Date(v.data).getTime() >= aberturaTs);
    } catch (err) {
      console.error(err);
    }

    let vendasDinheiro = 0;
    let vendasPix = 0;
    let vendasCartoes = 0;

    vendas.forEach(v => {
      const val = parseFloat(v.total) || 0;
      if (v.formaPagamento === 'DINHEIRO') vendasDinheiro += val;
      else if (v.formaPagamento === 'PIX') vendasPix += val;
      else vendasCartoes += val;
    });

    const totalCaixaFinal = fundo + vendasDinheiro + vendasPix + vendasCartoes;

    document.getElementById('cash-close-initial').textContent = fundo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('cash-close-money').textContent = vendasDinheiro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('cash-close-pix').textContent = vendasPix.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('cash-close-cards').textContent = vendasCartoes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('cash-close-total').textContent = totalCaixaFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const modal = document.getElementById('modal-cash-close');
    if (modal) modal.classList.remove('hidden');
  }

  async closeRegister() {
    const doBackup = document.getElementById('cash-close-backup-cb')?.checked;
    
    localStorage.setItem('vendest_caixa_aberto', 'false');
    this.closeCashRegisterModal();
    this.checkRegisterStatus();
    showToast('Caixa fechado com sucesso!', 'success');

    if (doBackup && window.backupModule) {
      window.backupModule.exportJsonBackup();
    }
  }
  // -----------------------

  focusScanInput() {
    const input = document.getElementById('pdv-barcode-input');
    if (input) {
      input.focus();
      input.select();
    }
  }

  async loadProductCatalog() {
    try {
      this.catalog = await dbManager.listarProdutos();
    } catch (err) {
      console.error('Erro ao carregar catálogo para PDV:', err);
    }
  }

  bindEvents() {
    const scanInput = document.getElementById('pdv-barcode-input');
    if (scanInput) {
      scanInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleBarcodeScan(scanInput.value.trim());
        }
      });

      scanInput.addEventListener('input', (e) => {
        this.renderSearchResults(e.target.value.trim());
      });
    }

    const amountReceivedInput = document.getElementById('pdv-amount-received');
    if (amountReceivedInput) {
      ['input', 'keyup', 'change', 'blur'].forEach(evtName => {
        amountReceivedInput.addEventListener(evtName, () => this.calculateChange());
      });
    }

    const paymentButtons = document.querySelectorAll('.pdv-payment-btn');
    paymentButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        paymentButtons.forEach(b => b.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-600/30', 'border-indigo-500'));
        const currentBtn = e.currentTarget;
        currentBtn.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-600/30', 'border-indigo-500');
        this.selectedPaymentMethod = currentBtn.dataset.method;
        this.toggleCashSection();
      });
    });

    const discountInput = document.getElementById('pdv-discount-input');
    if (discountInput) {
      discountInput.addEventListener('input', (e) => {
        this.discount = parseFloat(e.target.value) || 0;
        this.renderCart();
      });
    }
  }

  async handleBarcodeScan(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return;

    try {
      this.catalog = await dbManager.listarProdutos();

      const q = trimmed.toLowerCase();

      let product = this.catalog.find(p => String(p.codigo || p.code || '').trim().toLowerCase() === q);

      if (!product) {
        const matches = this.catalog.filter(p => {
          const nome = p.nome || p.name || '';
          return nome.toLowerCase().includes(q);
        });

        if (matches.length === 1) {
          product = matches[0];
        } else if (matches.length > 1) {
          await this.renderSearchResults(trimmed);
          showToast('Múltiplos produtos encontrados. Escolha o item desejado.', 'info');
          return;
        }
      }

      if (product) {
        this.addProductToCart(product);
        const scanInput = document.getElementById('pdv-barcode-input');
        if (scanInput) scanInput.value = '';
        this.hideSearchResults();
      } else {
        showToast(`Produto com código ou nome "${trimmed}" não encontrado.`, 'warning');
      }
    } catch (err) {
      console.error('Erro na busca de produtos no PDV:', err);
    }
  }

  async renderSearchResults(query) {
    const resultsContainer = document.getElementById('pdv-search-results');
    if (!resultsContainer) return;

    const trimmed = String(query || '').trim();
    if (trimmed.length < 1) {
      this.hideSearchResults();
      return;
    }

    try {
      if (!this.catalog || this.catalog.length === 0) {
        this.catalog = await dbManager.listarProdutos();
      }

      const q = trimmed.toLowerCase();
      const filtered = this.catalog.filter(p => {
        const nome = (p.nome || p.name || '').toLowerCase();
        const codigo = String(p.codigo || p.code || '').toLowerCase();
        const categoria = (p.categoria || p.category || '').toLowerCase();
        return nome.includes(q) || codigo.includes(q) || categoria.includes(q);
      }).slice(0, 8);

      if (filtered.length === 0) {
        resultsContainer.innerHTML = `
          <div class="p-3 text-center text-xs text-slate-400 font-medium">
            <i class="fa-solid fa-circle-exclamation mr-1 text-amber-400"></i> Nenhum produto encontrado para "${trimmed}"
          </div>
        `;
        resultsContainer.classList.remove('hidden');
        return;
      }

      resultsContainer.innerHTML = filtered.map(p => {
        const codigo = p.codigo || p.code || '';
        const nome = p.nome || p.name || '';
        const precoVenda = parseFloat(p.precoVenda || p.sellPrice || 0);
        const estoque = parseInt(p.quantidade || p.estoque || p.stockQty || 0, 10);

        return `
          <div onclick="pdvModule.selectSearchResult(${p.id})" class="flex items-center justify-between p-3 hover:bg-slate-700/90 cursor-pointer border-b border-slate-700/50 last:border-0 transition-colors">
            <div>
              <p class="font-semibold text-sm text-slate-100">${nome}</p>
              <p class="text-xs text-slate-400 font-mono">SKU: ${codigo} | Estoque: <span class="${estoque <= 5 ? 'text-amber-400 font-bold' : 'text-slate-300'}">${estoque} un</span></p>
            </div>
            <span class="font-bold text-emerald-400 text-sm">R$ ${precoVenda.toFixed(2)}</span>
          </div>
        `;
      }).join('');

      resultsContainer.classList.remove('hidden');
    } catch (err) {
      console.error('Erro ao renderizar resultados:', err);
    }
  }

  hideSearchResults() {
    const container = document.getElementById('pdv-search-results');
    if (container) container.classList.add('hidden');
  }

  selectSearchResult(productId) {
    const product = this.catalog.find(p => Number(p.id) === Number(productId));
    if (product) {
      this.addProductToCart(product);
      const scanInput = document.getElementById('pdv-barcode-input');
      if (scanInput) scanInput.value = '';
      this.hideSearchResults();
      this.focusScanInput();
    }
  }

  addProductToCart(product) {
    const estoqueAtual = parseInt(product.quantidade || product.estoque || product.stockQty || 0, 10);
    const precoVenda = parseFloat(product.precoVenda || product.sellPrice || 0);
    const codigo = product.codigo || product.code || '';
    const nome = product.nome || product.name || '';

    if (estoqueAtual <= 0) {
      showToast(`Atenção: O produto "${nome}" está com ESTOQUE ZERADO!`, 'error');
    }

    const existingIndex = this.cart.findIndex(item => item.id === product.id);

    if (existingIndex > -1) {
      if (this.cart[existingIndex].qty + 1 > estoqueAtual) {
        showToast(`Quantidade solicitada excede o estoque atual (${estoqueAtual} un).`, 'warning');
      }
      this.cart[existingIndex].qty += 1;
      this.cart[existingIndex].total = this.cart[existingIndex].qty * this.cart[existingIndex].price;
    } else {
      this.cart.push({
        id: product.id,
        code: codigo,
        name: nome,
        price: precoVenda,
        qty: 1,
        total: precoVenda,
        maxStock: estoqueAtual
      });
    }

    this.renderCart();
    showToast(`"${nome}" adicionado ao carrinho!`, 'success');
  }

  updateCartQty(index, delta) {
    if (!this.cart[index]) return;

    const newQty = this.cart[index].qty + delta;
    if (newQty <= 0) {
      this.removeCartItem(index);
      return;
    }

    if (newQty > this.cart[index].maxStock) {
      showToast(`Quantidade máxima em estoque atingida (${this.cart[index].maxStock} un).`, 'warning');
    }

    this.cart[index].qty = newQty;
    this.cart[index].total = newQty * this.cart[index].price;
    this.renderCart();
  }

  setCartQty(index, value) {
    const qty = parseInt(value, 10);
    if (isNaN(qty) || qty <= 0) {
      this.removeCartItem(index);
      return;
    }

    this.cart[index].qty = qty;
    this.cart[index].total = qty * this.cart[index].price;
    this.renderCart();
  }

  setCartItemPrice(index, value) {
    const newPrice = parseFloat(value);
    if (isNaN(newPrice) || newPrice < 0) {
      showToast('Preço unitário inválido.', 'error');
      this.renderCart(); // reseta o input para o valor anterior
      return;
    }
    this.cart[index].price = newPrice;
    this.cart[index].total = this.cart[index].qty * newPrice;
    this.renderCart();
  }

  removeCartItem(index) {
    this.cart.splice(index, 1);
    this.renderCart();
  }

  clearCart() {
    if (this.cart.length === 0) return;
    this.cart = [];
    this.discount = 0;
    const discountInput = document.getElementById('pdv-discount-input');
    if (discountInput) discountInput.value = 0;
    this.renderCart();
    showToast('Venda cancelada / carrinho limpo.', 'info');
    this.focusScanInput();
  }

  renderCart() {
    const tbody = document.getElementById('pdv-cart-body');
    const itemCountEl = document.getElementById('pdv-cart-item-count');
    const subtotalEl = document.getElementById('pdv-subtotal-price');
    const totalEl = document.getElementById('pdv-total-price');
    const totalHeaderEl = document.getElementById('pdv-header-total');

    if (!tbody) return;

    if (this.cart.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-4 py-12 text-center text-slate-400">
            <i class="fa-solid fa-cart-shopping text-4xl text-slate-600 mb-2 block"></i>
            <p class="font-medium text-slate-300">Carrinho Vazio</p>
            <p class="text-xs text-slate-500 mt-1">Bipe um código de barras ou pesquise acima para começar.</p>
          </td>
        </tr>
      `;
      if (itemCountEl) itemCountEl.textContent = '0 itens';
      if (subtotalEl) subtotalEl.textContent = 'R$ 0,00';
      if (totalEl) totalEl.textContent = 'R$ 0,00';
      if (totalHeaderEl) totalHeaderEl.textContent = 'R$ 0,00';
      return;
    }

    const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
    const finalTotal = Math.max(0, subtotal - this.discount);
    const totalQuantity = this.cart.reduce((sum, item) => sum + item.qty, 0);

    if (itemCountEl) itemCountEl.textContent = `${totalQuantity} item(ns)`;
    if (subtotalEl) subtotalEl.textContent = subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (totalEl) totalEl.textContent = finalTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (totalHeaderEl) totalHeaderEl.textContent = finalTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    tbody.innerHTML = this.cart.map((item, idx) => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 transition-colors text-sm">
        <td class="px-4 py-3">
          <p class="font-semibold text-slate-100">${item.name}</p>
          <p class="text-xs font-mono text-slate-400">SKU: ${item.code}</p>
        </td>
        <td class="px-4 py-3 text-slate-300">
          <div class="flex items-center space-x-1">
            <span class="text-xs">R$</span>
            <input type="number" step="0.01" min="0" value="${item.price.toFixed(2)}" onchange="pdvModule.setCartItemPrice(${idx}, this.value)" class="w-20 bg-slate-900 border border-slate-700 rounded text-slate-100 text-sm focus:outline-none focus:border-indigo-500 py-1 px-2">
          </div>
        </td>
        <td class="px-4 py-3">
          <div class="flex items-center space-x-1">
            <button onclick="pdvModule.updateCartQty(${idx}, -1)" class="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold transition-colors">-</button>
            <input type="number" min="1" value="${item.qty}" onchange="pdvModule.setCartQty(${idx}, this.value)" class="w-12 text-center bg-slate-900 border border-slate-700 rounded text-slate-100 text-sm font-semibold focus:outline-none focus:border-indigo-500 py-1">
            <button onclick="pdvModule.updateCartQty(${idx}, 1)" class="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold transition-colors">+</button>
          </div>
        </td>
        <td class="px-4 py-3 font-semibold text-emerald-400">R$ ${item.total.toFixed(2)}</td>
        <td class="px-4 py-3 text-right">
          <button onclick="pdvModule.removeCartItem(${idx})" class="text-rose-400 hover:text-rose-300 p-1.5 rounded hover:bg-rose-500/10 transition-colors" title="Remover item">
            <i class="fa-solid fa-xmark text-base"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  openPaymentModal() {
    if (!this.checkRegisterStatus()) {
      showToast('O caixa está fechado! Abra o caixa para finalizar vendas.', 'error');
      return;
    }

    if (this.cart.length === 0) {
      showToast('O carrinho está vazio! Adicione itens antes de finalizar a venda.', 'warning');
      return;
    }

    const modal = document.getElementById('modal-payment');
    const totalModalEl = document.getElementById('pdv-modal-total');
    const amountReceivedInput = document.getElementById('pdv-amount-received');

    const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
    const finalTotal = Math.max(0, subtotal - this.discount);

    if (totalModalEl) totalModalEl.textContent = finalTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (amountReceivedInput) {
      amountReceivedInput.value = finalTotal.toFixed(2);
    }

    this.toggleCashSection();
    this.calculateChange();

    if (modal) modal.classList.remove('hidden');
    if (amountReceivedInput && this.selectedPaymentMethod === 'DINHEIRO') {
      amountReceivedInput.focus();
      amountReceivedInput.select();
    }
  }

  closePaymentModal() {
    const modal = document.getElementById('modal-payment');
    if (modal) modal.classList.add('hidden');
    this.focusScanInput();
  }

  toggleCashSection() {
    const cashSection = document.getElementById('pdv-cash-section');
    if (!cashSection) return;

    if (this.selectedPaymentMethod === 'DINHEIRO') {
      cashSection.classList.remove('hidden');
      this.calculateChange();
    } else {
      cashSection.classList.add('hidden');
    }
  }

  calculateChange() {
    const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
    const finalTotal = Math.max(0, subtotal - this.discount);
    const amountReceived = parseFloat(document.getElementById('pdv-amount-received').value) || 0;
    const changeEl = document.getElementById('pdv-change-amount');
    const statusMsgEl = document.getElementById('pdv-cash-status');

    const change = amountReceived - finalTotal;

    if (changeEl) {
      changeEl.textContent = Math.max(0, change).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    if (statusMsgEl) {
      if (change < 0 && this.selectedPaymentMethod === 'DINHEIRO') {
        statusMsgEl.textContent = `Faltam R$ ${Math.abs(change).toFixed(2)}`;
        statusMsgEl.className = 'text-xs font-semibold text-rose-400 mt-1';
      } else {
        statusMsgEl.textContent = 'Valor recebido suficiente.';
        statusMsgEl.className = 'text-xs font-semibold text-emerald-400 mt-1';
      }
    }
  }

  /**
   * Executa a função estrita finalizarVenda(dadosVenda)
   */
  async submitSale() {
    if (this.cart.length === 0) return;

    const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
    const finalTotal = Math.max(0, subtotal - this.discount);
    const amountReceived = this.selectedPaymentMethod === 'DINHEIRO'
      ? (parseFloat(document.getElementById('pdv-amount-received').value) || finalTotal)
      : finalTotal;

    if (this.selectedPaymentMethod === 'DINHEIRO' && amountReceived < finalTotal) {
      showToast('O valor recebido é menor que o total da venda!', 'error');
      return;
    }

    const changeAmount = Math.max(0, amountReceived - finalTotal);

    const dadosVenda = {
      itens: this.cart.map(item => ({
        id: item.id,
        code: item.code,
        name: item.name,
        price: item.price,
        qty: item.qty,
        total: item.total
      })),
      subtotal,
      desconto: this.discount,
      total: finalTotal,
      formaPagamento: this.selectedPaymentMethod,
      valorRecebido: amountReceived,
      troco: changeAmount
    };

    try {
      // 1. Chama a função de transação de venda e baixa de estoque
      const completedSale = await dbManager.finalizarVenda(dadosVenda);
      this.lastCompletedSale = completedSale;

      showToast('Venda finalizada com sucesso! Baixa no estoque efetuada.', 'success');

      // 2. Limpa o carrinho
      this.cart = [];
      this.discount = 0;
      const discountInput = document.getElementById('pdv-discount-input');
      if (discountInput) discountInput.value = 0;
      this.renderCart();
      this.closePaymentModal();

      // 3. Atualiza a lista de estoque e atualiza os relatórios
      await dbManager.listarProdutos();
      if (window.reportsModule) {
        await window.reportsModule.carregarRelatorioVendasUI();
      }

      // Exibe recibo na tela
      this.openReceiptModal(completedSale);
    } catch (err) {
      console.error('Erro ao finalizar venda:', err);
      showToast('Erro ao processar venda no banco de dados local.', 'error');
    }
  }

  openReceiptModal(sale) {
    const modal = document.getElementById('modal-receipt');
    const container = document.getElementById('receipt-content');

    if (!modal || !container || !sale) return;

    const methodLabels = {
      'DINHEIRO': 'Dinheiro',
      'PIX': 'PIX',
      'CREDITO': 'Cartão de Crédito',
      'DEBITO': 'Cartão de Débito'
    };

    const dataHoraStr = sale.data ? new Date(sale.data).toLocaleString('pt-BR') : '';

    let configData = { nome: 'VendEst Comercio PDV', cnpj: '00.000.000/0001-00', telefone: '', endereco: '' };
    const savedConfig = localStorage.getItem('empresa_pdv');
    if (savedConfig) {
      try { configData = JSON.parse(savedConfig); } catch (e) {}
    }

    container.innerHTML = `
      <div class="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
        <h2 class="font-bold text-lg uppercase tracking-wider text-slate-900">${configData.nome || 'VendEst Comercio PDV'}</h2>
        <p class="text-xs text-slate-700">${configData.endereco || 'Sistema de Estoque & Frente de Caixa'}</p>
        <p class="text-xs text-slate-600 mt-1">CNPJ/CPF: ${configData.cnpj || '00.000.000/0001-00'}</p>
        ${configData.telefone ? `<p class="text-xs text-slate-600 mt-0.5">Tel/WhatsApp: ${configData.telefone}</p>` : ''}
        <p class="text-xs font-semibold text-slate-800 mt-1">CUPOM NÃO FISCAL</p>
      </div>

      <div class="text-xs text-slate-700 space-y-1 mb-3">
        <p><strong>Cód. Venda:</strong> ${sale.code || ''}</p>
        <p><strong>Data/Hora:</strong> ${dataHoraStr}</p>
        <p><strong>Forma Pagto:</strong> ${methodLabels[sale.formaPagamento] || sale.formaPagamento}</p>
      </div>

      <table class="w-full text-xs text-left mb-3">
        <thead>
          <tr class="border-b border-t border-dashed border-slate-400">
            <th class="py-1">Qtd x Item</th>
            <th class="py-1 text-right">Unit</th>
            <th class="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${sale.itens.map(item => `
            <tr>
              <td class="py-1">
                <span class="font-semibold">${item.qty}x</span> ${item.name}
              </td>
              <td class="py-1 text-right">R$ ${item.price.toFixed(2)}</td>
              <td class="py-1 text-right font-medium">R$ ${item.total.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="border-t border-dashed border-slate-400 pt-2 text-xs space-y-1 text-slate-800">
        <div class="flex justify-between">
          <span>Subtotal:</span>
          <span>R$ ${(sale.subtotal || sale.total).toFixed(2)}</span>
        </div>
        ${sale.desconto > 0 ? `
          <div class="flex justify-between text-rose-600">
            <span>Desconto:</span>
            <span>- R$ ${sale.desconto.toFixed(2)}</span>
          </div>
        ` : ''}
        <div class="flex justify-between font-bold text-sm text-slate-900 border-t border-slate-300 pt-1">
          <span>TOTAL:</span>
          <span>R$ ${sale.total.toFixed(2)}</span>
        </div>
        <div class="flex justify-between pt-1">
          <span>Valor Pago:</span>
          <span>R$ ${(sale.valorRecebido || sale.total).toFixed(2)}</span>
        </div>
        <div class="flex justify-between font-semibold">
          <span>Troco:</span>
          <span>R$ ${(sale.troco || 0).toFixed(2)}</span>
        </div>
      </div>

      <div class="text-center border-t border-dashed border-slate-400 mt-4 pt-3 text-[11px] text-slate-600">
        <p>Obrigado pela preferência!</p>
        <p class="font-mono mt-1">VendEst - 100% Offline</p>
      </div>
    `;

    modal.classList.remove('hidden');
  }

  closeReceiptModal() {
    const modal = document.getElementById('modal-receipt');
    if (modal) modal.classList.add('hidden');
    this.focusScanInput();
  }

  printReceipt() {
    window.print();
  }
}

const pdvModule = new PDVModule();
window.pdvModule = pdvModule;
