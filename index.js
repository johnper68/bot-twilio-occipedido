const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { getUserState, updateUserState, resetUserState } = require('./utils/state');

const APPSHEET_API_KEY = 'V2-0x5La-aR2Gn-wQpjm-tOyCs-p2Eh6-kTqr3-NNOsD-f63pX';
const BASE_URL = 'https://api.appsheet.com/api/v2/apps/bd0d8f70-0dfa-4d02-89c7-85f9d47a8bbb';
const PRODUCTOS_URL = `${BASE_URL}/tables/productos/Action`;
const PEDIDOS_URL = `${BASE_URL}/tables/pedido/Action`;
const ENCABEZADO_URL = `${BASE_URL}/tables/enc_pedido/Action`;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.post('/messages', async (req, res) => {
  const from = req.body.From || '';
  const body = req.body.Body?.trim().toLowerCase() || '';
  const phone = from.replace('whatsapp:', '');
  const state = getUserState(phone);

  let response = '';

  if (body === 'hola' || body === 'chatbot') {
    resetUserState(phone);
    updateUserState(phone, { paso: 'inicio' });
    response = '👋 Bienvenido al chatbot de Occiquimicos.\nEscribe *PEDIDO* para registrar productos o *FIN* para terminar.';
  } else if (body === 'pedido') {
    updateUserState(phone, { paso: 'buscar_producto' });
    response = '🛒 Escribe una palabra del producto (ej: alcohol, alumbre, etc.)';
  } else if (body === 'fin') {
    const pedidos = state.pedidos || [];
    if (pedidos.length === 0) {
      response = '❌ No hay productos registrados.';
    } else {
      let total = 0;
      const resumen = pedidos.map((p, i) => {
        const subtotal = p.cantidad * p.unit;
        total += subtotal;
        return `${i + 1}. ${p.nombre} - Cant: ${p.cantidad} - Unit: $${p.unit} - Total: $${subtotal}`;
      });
      updateUserState(phone, { paso: 'solicitar_nombre' });
      response = '🧾 Resumen del pedido:\n' + resumen.join('\n') + `\n💰 Total: $${total}\n\nEscribe tu *nombre completo*:`;
    }
  } else if (state.paso === 'buscar_producto') {
    try {
      const r = await axios.post(PRODUCTOS_URL, {
        Action: 'Find',
        Properties: { Locale: 'es-ES' },
        Rows: []
      }, {
        headers: { 'ApplicationAccessKey': APPSHEET_API_KEY }
      });
      const productos = r.data.value || [];
      const resultados = productos.filter(p => p.nombreProducto?.toLowerCase().includes(body));
      if (resultados.length === 0) {
        response = '❌ No se encontraron productos. Intenta otra palabra o escribe *FIN*';
      } else {
        const seleccion = resultados[0];
        updateUserState(phone, { paso: 'esperando_cantidad', producto: seleccion });
        response = `✅ Producto: *${seleccion.nombreProducto}* - Valor: $${seleccion.valor}\n\nEscribe la *cantidad*:`;
      }
    } catch (e) {
      response = '⚠️ Error consultando productos.';
    }
  } else if (state.paso === 'esperando_cantidad') {
    const cantidad = parseFloat(body);
    const producto = state.producto;
    if (!producto || isNaN(cantidad) || cantidad <= 0) {
      response = '❌ Cantidad no válida. Intenta de nuevo.';
    } else {
      const unit = parseFloat(producto.valor);
      const item = { nombre: producto.nombreProducto, cantidad, unit };
      const pedidos = state.pedidos || [];
      pedidos.push(item);
      updateUserState(phone, { pedidos, paso: 'buscar_producto', producto: null });
      response = `🧾 Producto registrado: *${producto.nombreProducto}*\nCantidad: ${cantidad}\nSubtotal: $${(cantidad * unit)}\n\nAgrega otro producto o escribe *FIN*.`;
    }
  } else if (state.paso === 'solicitar_nombre') {
    updateUserState(phone, { nombre: req.body.Body.trim(), paso: 'solicitar_direccion' });
    response = '🏠 Escribe tu dirección:';
  } else if (state.paso === 'solicitar_direccion') {
    updateUserState(phone, { direccion: req.body.Body.trim(), paso: 'solicitar_celular' });
    response = '📱 Escribe tu número de celular (10 dígitos):';
  } else if (state.paso === 'solicitar_celular') {
    const celular = req.body.Body.trim();
    if (!/^\d{10}$/.test(celular)) {
      response = '❌ El número debe tener 10 dígitos.';
    } else {
      const { nombre, direccion, pedidos } = state;
      const pedidoId = Math.random().toString(36).substring(2, 10);
      const fecha = new Date().toISOString().split('T')[0];
      let total = 0;
      const rows = pedidos.map(p => {
        const valor = p.cantidad * p.unit;
        total += valor;
        return {
          pedidoId,
          fecha,
          nombreProducto: p.nombre,
          cantidadProducto: p.cantidad,
          valor_unit: p.unit,
          valor,
          status: 'Pendiente'
        };
      });
      try {
        await axios.post(PEDIDOS_URL, { Action: 'Add', Properties: { Locale: 'es-ES' }, Rows: rows }, {
          headers: { 'ApplicationAccessKey': APPSHEET_API_KEY }
        });
        await axios.post(ENCABEZADO_URL, {
          Action: 'Add',
          Properties: { Locale: 'es-ES' },
          Rows: [{ pedidoId, cliente: nombre, direccion, celular, fecha, enc_total: total }]
        }, {
          headers: { 'ApplicationAccessKey': APPSHEET_API_KEY }
        });
        response = '✅ Pedido enviado correctamente.\n¡Gracias por comprar con Occiquímicos!';
        resetUserState(phone);
      } catch (e) {
        response = '❌ Error al guardar el pedido.';
      }
    }
  } else {
    response = '🤖 No entiendo tu mensaje. Escribe *PEDIDO* o *FIN*.';
  }

  res.set('Content-Type', 'text/xml');
  res.send(`
    <Response>
      <Message>${response}</Message>
    </Response>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Bot escuchando en puerto ${PORT}`));
