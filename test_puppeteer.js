const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
  
  await page.goto('http://localhost:8080');
  
  // Wait for 1 second
  await new Promise(r => setTimeout(r, 1000));
  
  // Add a product
  await page.evaluate(async () => {
    try {
      const dbData = { codigo: "123", nome: "TestPuppeteer", quantidade: 10, precoCusto: 5, precoVenda: 10, categoria: "Geral" };
      await window.dbManager.salvarProduto(dbData);
      console.log('Product injected via DBManager!');
    } catch(err) {
      console.log('Error injecting product:', err.message);
    }
  });
  
  // Reload page
  await page.reload();
  await new Promise(r => setTimeout(r, 1000));
  
  // Check rows
  const rowCount = await page.evaluate(() => {
    return document.getElementById('stock-table-body') ? document.getElementById('stock-table-body').children.length : -1;
  });
  
  console.log('ROWS IN STOCK TABLE:', rowCount);
  
  const tbodyHtml = await page.evaluate(() => {
    return document.getElementById('stock-table-body') ? document.getElementById('stock-table-body').innerHTML : 'MISSING';
  });
  console.log('TBODY HTML LENGTH:', tbodyHtml.length);
  
  await browser.close();
})();
