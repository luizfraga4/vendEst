/**
 * Módulo de Banco de Dados Local (IndexedDB Native)
 * Nome do Banco: PDV_Estoque_DB
 * Stores: 'produtos' e 'vendas' (Sem dados fake, persistência local atômica 100% limpa)
 */

class DBManager {
  constructor() {
    this.dbName = 'PDV_Estoque_DB';
    this.db = null;
    this.initPromise = null;
  }

  /**
   * 1. Inicializa o banco de dados IndexedDB sem inserir nenhum dado falso
   */
  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 4);

      request.onerror = (event) => {
        console.error('❌ Erro ao abrir IndexedDB:', event.target.error);
        this.initPromise = null;
        reject('Não foi possível inicializar o banco de dados local.');
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('✅ IndexedDB "PDV_Estoque_DB" aberto. Versão:', this.db.version, '| Stores:', Array.from(this.db.objectStoreNames));
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('produtos')) {
          const productStore = db.createObjectStore('produtos', { keyPath: 'id', autoIncrement: true });
          productStore.createIndex('codigo', 'codigo', { unique: true });
        }
        if (!db.objectStoreNames.contains('vendas')) {
          const salesStore = db.createObjectStore('vendas', { keyPath: 'id', autoIncrement: true });
          salesStore.createIndex('data', 'data', { unique: false });
        }
        if (!db.objectStoreNames.contains('comandas')) {
          db.createObjectStore('comandas', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('sangrias')) {
          db.createObjectStore('sangrias', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('compras')) {
          const comprasStore = db.createObjectStore('compras', { keyPath: 'id', autoIncrement: true });
          comprasStore.createIndex('data', 'data', { unique: false });
        }
        if (!db.objectStoreNames.contains('caixas')) {
          db.createObjectStore('caixas', { keyPath: 'id', autoIncrement: true });
        }
      };
    });

    return this.initPromise;
  }

  async ensureDB() {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Banco de dados não está acessível.');
    }
    return this.db;
  }

  /* ==========================================================================
     MÉTODOS CRUD DE PRODUTOS (ESTOQUE)
     ========================================================================== */

  /**
   * salvarProduto(produto): Adiciona ou atualiza no store 'produtos'
   */
  async salvarProduto(produto) {
    await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('produtos', 'readwrite');
      const store = tx.objectStore('produtos');

      const qty = parseInt(produto.quantidade || produto.estoque || produto.stockQty, 10);
      
      const dataToSave = {
        codigo: String(produto.codigo || produto.code || '').trim(),
        nome: String(produto.nome || produto.name || '').trim(),
        categoria: String(produto.categoria || produto.category || 'Geral').trim(),
        precoCusto: parseFloat(produto.precoCusto || produto.costPrice) || 0,
        precoVenda: parseFloat(produto.precoVenda || produto.sellPrice) || 0,
        quantidade: isNaN(qty) ? 0 : qty,
        estoque: isNaN(qty) ? 0 : qty,
        updatedAt: new Date().toISOString()
      };

      if (produto.id) {
        dataToSave.id = Number(produto.id);
      }

      const request = store.put(dataToSave);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * listarProdutos(): Retorna getAll() do store 'produtos' e chama renderizarTabelaEstoque
   */
  async listarProdutos() {
    await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('produtos', 'readonly');
      const store = tx.objectStore('produtos');
      const request = store.getAll();

      request.onsuccess = () => {
        const produtos = request.result || [];
        produtos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        resolve(produtos);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Exclui um produto do store 'produtos' pelo ID
   */
  async excluirProduto(id) {
    await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('produtos', 'readwrite');
      const store = tx.objectStore('produtos');
      const request = store.delete(Number(id));

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Busca produto por código no store 'produtos'
   */
  async buscarProdutoPorCodigo(codigo) {
    await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('produtos', 'readonly');
      const store = tx.objectStore('produtos');
      const index = store.index('codigo');
      const request = index.get(String(codigo).trim());

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /* ==========================================================================
     MÉTODOS DE VENDA E BAIXA DE ESTOQUE
     ========================================================================== */

  /**
   * finalizarVenda(dadosVenda):
   * 1. Transação readwrite englobando 'produtos' e 'vendas'.
   * 2. Grava a venda no store 'vendas'.
   * 3. Para cada item da venda, subtrai a quantidade do store 'produtos'.
   */
  async finalizarVenda(dadosVenda) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Banco de dados não está acessível.'));
      }

      const tx = this.db.transaction(['produtos', 'vendas'], 'readwrite');
      const productStore = tx.objectStore('produtos');
      const salesStore = tx.objectStore('vendas');

      let completedSale = null;
      let settled = false;

      const safeResolve = (val) => { if (!settled) { settled = true; resolve(val); } };
      const safeReject  = (err) => { if (!settled) { settled = true; reject(err); } };

      tx.onerror = (event) => {
        console.error('❌ Erro na transação de venda:', event.target.error);
        safeReject(event.target.error);
      };

      tx.oncomplete = () => {
        console.log('✅ Venda concluída com sucesso:', completedSale);
        if (window.stockModule && typeof window.stockModule.loadProducts === 'function') {
          window.stockModule.loadProducts();
        }
        safeResolve(completedSale);
      };

      const now = new Date();
      const record = {
        code: `VD-${Date.now().toString().slice(-6)}`,
        data: now.toISOString(),
        timestamp: Date.now(),
        itens: dadosVenda.itens,
        subtotal: parseFloat(dadosVenda.subtotal || dadosVenda.total),
        desconto: parseFloat(dadosVenda.desconto || 0),
        total: Number(dadosVenda.total),
        formaPagamento: String(dadosVenda.formaPagamento),
        pagamentos: Array.isArray(dadosVenda.pagamentos)
          ? dadosVenda.pagamentos
          : [{ forma: String(dadosVenda.formaPagamento), valor: Number(dadosVenda.total) }],
        observacao: String(dadosVenda.observacao || ''),
        valorRecebido: parseFloat(dadosVenda.valorRecebido || dadosVenda.total),
        troco: parseFloat(dadosVenda.troco || 0)
      };

      const addSaleReq = salesStore.add(record);
      addSaleReq.onsuccess = (e) => {
        record.id = e.target.result;
        completedSale = record;
      };
      addSaleReq.onerror = (e) => {
        safeReject(new Error('Falha ao gravar venda: ' + (e.target.error || '')));
      };

      // Baixa de estoque: processa cada item individualmente
      // Se produto não encontrado, pula a baixa mas não cancela a venda
      dadosVenda.itens.forEach(item => {
        const getReq = productStore.get(Number(item.id));
        getReq.onsuccess = () => {
          const produto = getReq.result;
          if (!produto) {
            console.warn(`[DB] Produto ID ${item.id} ("${item.name}") não encontrado — baixa de estoque ignorada para este item.`);
            return; // Pula a baixa, a venda continua
          }

          const qtdAtual = Number(produto.quantidade || produto.estoque || 0);
          const qtdVendida = Number(item.quantidade || item.qty || 0);

          produto.quantidade = qtdAtual - qtdVendida;
          produto.estoque = produto.quantidade;
          produto.updatedAt = new Date().toISOString();

          productStore.put(produto);
        };

        getReq.onerror = (e) => {
          console.warn(`[DB] Erro ao buscar produto ID ${item.id} para baixa de estoque:`, e.target.error);
          // Não aborta — apenas pula a baixa deste item
        };
      });
    });
  }

  /* ==========================================================================
     MÉTODOS DE RELATÓRIO DE VENDAS
     ========================================================================== */

  /**
   * carregarRelatorioVendas(filtroInicio = null, filtroFim = null):
   * Busca vendas no store 'vendas' e aplica filtro de intervalo por timestamp/data
   */
  async carregarRelatorioVendas(filtroInicio = null, filtroFim = null) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      const tx = this.db.transaction('vendas', 'readonly');
      const store = tx.objectStore('vendas');
      const request = store.getAll();

      request.onsuccess = () => {
        let vendas = request.result || [];
        vendas.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        const parseBound = (val, isEnd = false) => {
          if (val === null || val === undefined || val === '') return null;
          if (typeof val === 'number') return val;
          const str = String(val).trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            const dt = new Date(`${str}${isEnd ? 'T23:59:59.999' : 'T00:00:00.000'}`);
            return isNaN(dt.getTime()) ? null : dt.getTime();
          }
          const dt = new Date(str);
          return isNaN(dt.getTime()) ? null : dt.getTime();
        };

        const startTs = parseBound(filtroInicio, false);
        const endTs = parseBound(filtroFim, true);

        if (startTs !== null || endTs !== null) {
          vendas = vendas.filter(venda => {
            const vTs = venda.timestamp || (venda.data ? new Date(venda.data).getTime() : 0);
            if (startTs !== null && vTs < startTs) return false;
            if (endTs !== null && vTs > endTs) return false;
            return true;
          });
        }

        resolve(vendas);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  /* ==========================================================================
     MÉTODOS DE COMANDAS E SANGRIAS
     ========================================================================== */

  async salvarComanda(comanda) {
    await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('comandas', 'readwrite');
      const store = tx.objectStore('comandas');
      
      const request = store.put({
        ...comanda,
        updatedAt: new Date().toISOString()
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async listarComandas() {
    await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('comandas', 'readonly');
      const store = tx.objectStore('comandas');
      const request = store.getAll();

      request.onsuccess = () => {
        const comandas = request.result || [];
        resolve(comandas.filter(c => c.status !== 'fechada' && c.status !== 'MESCLADA'));
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async excluirComanda(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('comandas', 'readwrite');
      const store = tx.objectStore('comandas');
      const request = store.delete(Number(id));

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async salvarSangria(sangria) {
    await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sangrias', 'readwrite');
      const store = tx.objectStore('sangrias');
      
      const request = store.put({
        ...sangria,
        data: sangria.data || new Date().toISOString(),
        timestamp: Date.now()
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async listarSangriasPorTurno(aberturaTs) {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([]);
      const tx = this.db.transaction('sangrias', 'readonly');
      const store = tx.objectStore('sangrias');
      const request = store.getAll();

      request.onsuccess = () => {
        const sangrias = request.result || [];
        resolve(sangrias.filter(s => s.timestamp >= aberturaTs));
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async listarSangriasPorPeriodo(filtroInicio = null, filtroFim = null) {
    return new Promise((resolve, reject) => {
      if (!this.db || !this.db.objectStoreNames.contains('sangrias')) return resolve([]);
      const tx = this.db.transaction('sangrias', 'readonly');
      const store = tx.objectStore('sangrias');
      const request = store.getAll();

      request.onsuccess = () => {
        let sangrias = request.result || [];

        const parseBound = (val, isEnd = false) => {
          if (val === null || val === undefined || val === '') return null;
          if (typeof val === 'number') return val;
          const str = String(val).trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            const dt = new Date(`${str}${isEnd ? 'T23:59:59.999' : 'T00:00:00.000'}`);
            return isNaN(dt.getTime()) ? null : dt.getTime();
          }
          const dt = new Date(str);
          return isNaN(dt.getTime()) ? null : dt.getTime();
        };

        const startTs = parseBound(filtroInicio, false);
        const endTs = parseBound(filtroFim, true);

        if (startTs !== null || endTs !== null) {
          sangrias = sangrias.filter(s => {
            const sTs = s.timestamp || (s.data ? new Date(s.data).getTime() : 0);
            if (startTs !== null && sTs < startTs) return false;
            if (endTs !== null && sTs > endTs) return false;
            return true;
          });
        }

        resolve(sangrias);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /* ==========================================================================
     MÉTODOS DE COMPRAS / DESPESAS
     ========================================================================== */

  async salvarCompra(compra) {
    return new Promise((resolve, reject) => {
      if (!this.db || !this.db.objectStoreNames.contains('compras')) {
        return reject(new Error('Banco de dados não está acessível.'));
      }

      const tx = this.db.transaction('compras', 'readwrite');
      const store = tx.objectStore('compras');

      const now = new Date();
      const record = {
        data: compra.data || now.toISOString(),
        timestamp: compra.timestamp || Date.now(),
        descricao: String(compra.descricao || compra.fornecedor || '').trim(),
        fornecedor: String(compra.fornecedor || compra.descricao || '').trim(),
        categoria: String(compra.categoria || 'Outros').trim(),
        formaPagamento: String(compra.formaPagamento || 'Dinheiro').trim(),
        valor: parseFloat(compra.valor) || 0,
        criadoPor: compra.criadoPor || (window.authModule ? window.authModule.currentUser : 'Admin')
      };

      if (compra.id) {
        record.id = Number(compra.id);
        const req = store.put(record);
        req.onsuccess = () => resolve(record);
        req.onerror = (e) => reject(e.target.error);
      } else {
        const req = store.add(record);
        req.onsuccess = (e) => {
          record.id = e.target.result;
          resolve(record);
        };
        req.onerror = (e) => reject(e.target.error);
      }
    });
  }

  async listarCompras(filtroInicio = null, filtroFim = null) {
    return new Promise((resolve, reject) => {
      if (!this.db || !this.db.objectStoreNames.contains('compras')) return resolve([]);

      const tx = this.db.transaction('compras', 'readonly');
      const store = tx.objectStore('compras');
      const request = store.getAll();

      request.onsuccess = () => {
        let compras = request.result || [];
        compras.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        const parseBound = (val, isEnd = false) => {
          if (val === null || val === undefined || val === '') return null;
          if (typeof val === 'number') return val;
          const str = String(val).trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            const dt = new Date(`${str}${isEnd ? 'T23:59:59.999' : 'T00:00:00.000'}`);
            return isNaN(dt.getTime()) ? null : dt.getTime();
          }
          const dt = new Date(str);
          return isNaN(dt.getTime()) ? null : dt.getTime();
        };

        const startTs = parseBound(filtroInicio, false);
        const endTs = parseBound(filtroFim, true);

        if (startTs !== null || endTs !== null) {
          compras = compras.filter(c => {
            const cTs = c.timestamp || (c.data ? new Date(c.data).getTime() : 0);
            if (startTs !== null && cTs < startTs) return false;
            if (endTs !== null && cTs > endTs) return false;
            return true;
          });
        }

        resolve(compras);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  async excluirCompra(id) {
    return new Promise((resolve, reject) => {
      if (!this.db || !this.db.objectStoreNames.contains('compras')) return reject(new Error('Banco de dados não acessível.'));
      const tx = this.db.transaction('compras', 'readwrite');
      const store = tx.objectStore('compras');
      const req = store.delete(Number(id));

      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async salvarSessaoCaixa(sessao) {
    return new Promise((resolve, reject) => {
      if (!this.db || !this.db.objectStoreNames.contains('caixas')) return resolve(null);
      const tx = this.db.transaction('caixas', 'readwrite');
      const store = tx.objectStore('caixas');
      const record = {
        ...sessao,
        timestamp: sessao.timestamp || Date.now(),
        updatedAt: new Date().toISOString()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async listarSessoesCaixa() {
    return new Promise((resolve, reject) => {
      if (!this.db || !this.db.objectStoreNames.contains('caixas')) return resolve([]);
      const tx = this.db.transaction('caixas', 'readonly');
      const store = tx.objectStore('caixas');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /* ==========================================================================
     MÉTODOS DE BACKUP
     ========================================================================== */

  async exportarDados() {
    const produtos = await this.listarProdutos();
    const vendas = await this.carregarRelatorioVendas();
    
    const comandas = await new Promise((resolve) => {
      if (!this.db.objectStoreNames.contains('comandas')) return resolve([]);
      const tx = this.db.transaction('comandas', 'readonly');
      const req = tx.objectStore('comandas').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    
    const sangrias = await new Promise((resolve) => {
      if (!this.db.objectStoreNames.contains('sangrias')) return resolve([]);
      const tx = this.db.transaction('sangrias', 'readonly');
      const req = tx.objectStore('sangrias').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    const compras = await new Promise((resolve) => {
      if (!this.db.objectStoreNames.contains('compras')) return resolve([]);
      const tx = this.db.transaction('compras', 'readonly');
      const req = tx.objectStore('compras').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    const caixas = await this.listarSessoesCaixa();

    // Sessão de caixa ativa no momento (localStorage)
    const isAberto = localStorage.getItem('vendest_caixa_aberto') === 'true';
    const fundoInicial = parseFloat(localStorage.getItem('vendest_caixa_fundo')) || 0;
    const aberturaTs = parseInt(localStorage.getItem('vendest_caixa_abertura_ts'), 10) || 0;
    const operadorStr = (window.authModule && window.authModule.currentUser) ? window.authModule.currentUser : 'Operador';
    
    const sangriasTurno = (isAberto && aberturaTs > 0)
      ? sangrias.filter(s => (s.timestamp || (s.data ? new Date(s.data).getTime() : 0)) >= aberturaTs)
      : [];

    const caixaAtual = {
      id: aberturaTs || Date.now(),
      status: isAberto ? 'ABERTO' : 'FECHADO',
      fundoInicial: fundoInicial,
      dataHoraAbertura: aberturaTs ? new Date(aberturaTs).toISOString() : null,
      aberturaTs: aberturaTs,
      operador: operadorStr,
      sangrias: sangriasTurno
    };

    return {
      version: 4,
      dbName: 'PDV_Estoque_DB',
      exportedAt: new Date().toISOString(),
      produtos,
      vendas,
      comandas,
      sangrias,
      compras,
      caixas,
      caixaAtual
    };
  }

  async importarDados(data, replaceAll = true) {
    if (!data || (!Array.isArray(data.produtos) && !Array.isArray(data.products))) {
      throw new Error('Arquivo de backup inválido.');
    }

    const produtosData = data.produtos || data.products || [];

    const availableStores = ['produtos', 'vendas', 'comandas', 'sangrias'];
    if (this.db.objectStoreNames.contains('compras')) {
      availableStores.push('compras');
    }
    if (this.db.objectStoreNames.contains('caixas')) {
      availableStores.push('caixas');
    }

    const tx = this.db.transaction(availableStores, 'readwrite');
    const productStore = tx.objectStore('produtos');
    const salesStore = tx.objectStore('vendas');
    const comandasStore = tx.objectStore('comandas');
    const sangriasStore = tx.objectStore('sangrias');
    const comprasStore = this.db.objectStoreNames.contains('compras') ? tx.objectStore('compras') : null;
    const caixasStore = this.db.objectStoreNames.contains('caixas') ? tx.objectStore('caixas') : null;

    if (replaceAll) {
      productStore.clear();
      salesStore.clear();
      comandasStore.clear();
      sangriasStore.clear();
      if (comprasStore) comprasStore.clear();
      if (caixasStore) caixasStore.clear();
    }

    for (const p of produtosData) {
      delete p.id;
      if (!p.categoria && !p.category) {
        p.categoria = 'Geral';
      }
      productStore.add(p);
    }

    const vendasArr = data.vendas || data.sales;
    if (Array.isArray(vendasArr)) {
      for (const v of vendasArr) {
        delete v.id;
        salesStore.add(v);
      }
    }

    if (Array.isArray(data.comandas)) {
      for (const c of data.comandas) {
        delete c.id;
        comandasStore.add(c);
      }
    }

    if (Array.isArray(data.sangrias)) {
      for (const s of data.sangrias) {
        delete s.id;
        sangriasStore.add(s);
      }
    }

    if (comprasStore && Array.isArray(data.compras)) {
      for (const comp of data.compras) {
        delete comp.id;
        comprasStore.add(comp);
      }
    }

    if (caixasStore && Array.isArray(data.caixas)) {
      for (const cx of data.caixas) {
        delete cx.id;
        caixasStore.add(cx);
      }
    }

    // Restauração do caixaAtual no localStorage
    if (data.caixaAtual) {
      const statusUpper = String(data.caixaAtual.status || '').toUpperCase();
      if (statusUpper === 'ABERTO' || data.caixaAtual.status === true) {
        localStorage.setItem('vendest_caixa_aberto', 'true');
        const fundo = parseFloat(data.caixaAtual.fundoInicial || data.caixaAtual.fundo || 0);
        localStorage.setItem('vendest_caixa_fundo', fundo.toString());
        let ts = data.caixaAtual.aberturaTs;
        if (!ts && data.caixaAtual.dataHoraAbertura) {
          ts = new Date(data.caixaAtual.dataHoraAbertura).getTime();
        }
        if (!ts || isNaN(ts)) ts = Date.now();
        localStorage.setItem('vendest_caixa_abertura_ts', ts.toString());
      } else {
        localStorage.setItem('vendest_caixa_aberto', 'false');
      }
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }
}

// Instância global do banco de dados
const dbManager = new DBManager();
window.dbManager = dbManager;
