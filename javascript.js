"use strict";

window.addEventListener('load', function() {

    // Parámetros para el cálculo
    const Parametros = {
        valor_bpc: 4519,
        tasa_aportes_jubilatorios: 0.15,

        tasa_frl: 0.001,
        franjas_irpf: [
            { de:   0, a:   7, tasa: 0    },
            { de:   7, a:  10, tasa: 0.10 },
            { de:  10, a:  15, tasa: 0.15 },
            { de:  15, a:  30, tasa: 0.24 },
            { de:  30, a:  50, tasa: 0.25 },
            { de:  50, a:  75, tasa: 0.27 },
            { de:  75, a: 115, tasa: 0.31 },
            { de: 115, a: Number.MAX_SAFE_INTEGER, tasa: 0.36 }
        ],

        franjas_irpf_nf: [
            { de:   0, a:   8, tasa: 0 },
            { de:   8, a:  12, tasa: 0.10 },
            { de:  12, a:  15, tasa: 0.15 },
            { de:  15, a:  50, tasa: 0.20 },
            { de:  50, a: 100, tasa: 0.22 },
            { de: 100, a: Number.MAX_SAFE_INTEGER, tasa: 0.25 }
        ],

        franjas_irpf_nf_2: [
            { de:   0, a:  14, tasa: 0 },
            { de:  14, a:  15, tasa: 0.15 },
            { de:  15, a:  50, tasa: 0.20 },
            { de:  50, a: 100, tasa: 0.22 },
            { de: 100, a: Number.MAX_SAFE_INTEGER, tasa: 0.25 }
        ],

        franjas_aportes: [{
            desde: 0,
            fonasa_base: 0.03,
            fonasa_conyugue: 0.02,
            fonasa_hijos: 0,
            tasa_deducciones: 0.10,
            incremento_ingresos: 0,
        }, {
            desde: 2.5,
            fonasa_base: 0.045,
            fonasa_hijos: 0.015
        }, {
            desde: 10,
            incremento_ingresos: 0.06
        }, {
            desde: 15,
            tasa_deducciones: 0.08
        }],
        
        franjas_afap: [
            { desde:     0, hasta: 62804 },
            { desde: 62804, hasta: 94206 },
            { desde: 94206, hasta: 188411}
        ],

        deduccion_dependiente_sin_discapacidad: 13 / 12,
        deduccion_dependiente_con_discapacidad: 26 / 12,

        adicional_fondo_solidaridad: (5 / 3),
    };

    var Programa = {

        // datos calculados
        bpc: 0,
        salario_liquido: 0,
        salario_nominal: 0,
        salario_nominal_en_bpc: 0,
        tasas_aplicables: {},
        monto_gravado: 0,
        conyugue_a_cargo: false,
        hijos_a_cargo: false,
        dependientes: false,
        factor_aporte_fsol: 0,
        aporta_adicional_fsol: false,
        porcentaje_fonasa: 0,
        aportes_fonasa: 0,
        aportes_jubilatorios: 0,
        aportes_frl: 0,
        aportes_fsol: 0,
        aportes_cjppu: 0,
        otras_deducciones: 0,
        total_deducciones: 0,
        detalle_irpf: [],
        
        // Métodos
        // obtener tasas aplicables (no IRPF)
        actualizar_tasas() {
            var tasas = {};
            var i;
            for(i=0; i < Parametros.franjas_aportes.length; i++) {
                if (Parametros.franjas_aportes[i].desde <= this.salario_nominal_en_bpc) {
                    tasas = { ...tasas, ...Parametros.franjas_aportes[i] };
                } else {
                    break;
                }
            }
            this.tasas_aplicables = tasas;
        },

        // calcular porcentaje FONASA
        calcular_aportes_fonasa() {
            this.porcentaje_fonasa = this.tasas_aplicables.fonasa_base;

            if (this.hijos_a_cargo) {
                this.porcentaje_fonasa += this.tasas_aplicables.fonasa_hijos;
            }

            if (this.conyugue_a_cargo) {
                this.porcentaje_fonasa += this.tasas_aplicables.fonasa_conyugue;
            }

            this.aportes_fonasa = this.salario_nominal * this.porcentaje_fonasa;
        },

        // calcular aportes jubilatorios
        calcular_aportes_jubilatorios() {
            this.aportes_jubilatorios = Math.min(
                Parametros.franjas_afap.slice(-1)[0].hasta,
                this.salario_nominal
            ) * Parametros.tasa_aportes_jubilatorios;
        },

        calcular_aportes_frl() {
            this.aportes_frl = this.salario_nominal * Parametros.tasa_frl;
        },

        calcular_aportes_fsol() {
            this.aportes_fsol = this.factor_aporte_fsol;
            if (this.aporta_adicional_fsol) {
                this.aportes_fsol += Parametros.adicional_fondo_solidaridad;
            }
            this.aportes_fsol *= this.bpc / 12;
        },

        calcular_deducciones() {
            // https://www.dgi.gub.uy/wdgi/page?2,rentas-de-trabajo-160,preguntas-frecuentes-ampliacion,O,es,0,PAG;CONC;1017;8;D;cuales-son-las-deducciones-personales-admitidas-en-la-liquidacion-del-irpf-33486;3;PAG;
            var deducciones_dependientes = 0;
            this.dependientes.forEach((dependiente) => {
                var factor_atribucion = dependiente.porcentaje;
                var factor_deduccion;
                if (dependiente.discapacidad) {
                    factor_deduccion = Parametros.deduccion_dependiente_con_discapacidad;
                } else {
                    factor_deduccion = Parametros.deduccion_dependiente_sin_discapacidad;
                }
                deducciones_dependientes += factor_atribucion * this.bpc * factor_deduccion;
            });
            this.total_deducciones = (
                deducciones_dependientes +
                this.aportes_jubilatorios +
                this.aportes_fonasa +
                this.aportes_frl +
                this.aportes_fsol +
                this.aportes_cjppu +
                this.otras_deducciones
            );
        },

        calcular_irpf() {
            // cálculo de IRPF para cada franja
            this.detalle_irpf = Parametros.franjas_irpf.map((franja) => {
                var base_en_pesos = franja.de * this.bpc;
                var tope_en_pesos = franja.a * this.bpc;
                var franja_en_pesos = 0;
                if (this.monto_gravado > base_en_pesos) {
                    franja_en_pesos = Math.min(this.monto_gravado, tope_en_pesos) - base_en_pesos;
                }
                return franja_en_pesos * franja.tasa;
            });

            var suma_irpf = this.detalle_irpf.reduce((a, b) => a+b, 0);
            this.total_irpf = Math.max(0, suma_irpf - this.total_deducciones * this.tasas_aplicables.tasa_deducciones);
        },

        calcular_salario() {
            this.salario_liquido = (
                this.salario_nominal - this.aportes_jubilatorios - this.aportes_fonasa -
                this.aportes_frl - this.aportes_fsol - this.total_irpf - this.aportes_cjppu
            );
        },

        // calcular valores a partir de un salario ingresado
        actualizar(salario, bpc, conyugue_a_cargo, hijos_a_cargo, dependientes, factor_fsol,
                   adicional_fsol, aportes_cjppu, otras_deducciones) {
            this.bpc = bpc;
            this.salario_nominal = salario;
            this.conyugue_a_cargo = conyugue_a_cargo;
            this.hijos_a_cargo = hijos_a_cargo;
            this.dependientes = dependientes;
            this.salario_nominal_en_bpc = salario / bpc;
            this.otras_deducciones = otras_deducciones;
            this.factor_aporte_fsol = factor_fsol;
            this.aporta_adicional_fsol = adicional_fsol;
            this.aportes_cjppu = aportes_cjppu;
            this.actualizar_tasas();
            this.monto_gravado = salario * (1 + this.tasas_aplicables.incremento_ingresos);
            this.calcular_aportes_fonasa();
            this.calcular_aportes_jubilatorios();
            this.calcular_aportes_frl();
            this.calcular_aportes_fsol();
            this.calcular_deducciones();
            this.calcular_irpf();
            this.calcular_salario();
        },
    };
    
    var UI = {
        // campos de entrada
        input_bpc: document.getElementById('valor_bpc'),
        input_salario_nominal: document.getElementById('input_salario'),
        input_tiene_afap: document.getElementById('input_tiene_afap'),
        input_articulo8: document.getElementById('input_articulo8'),
        input_fsol: document.getElementById('input_fsol'),
        input_cjppu: document.getElementById('input_cjppu'),
        input_otras_deducciones: document.getElementById('input_otras_deducciones'),
        checkbox_adicional_fsol: document.getElementById('input_adicional_fsol'),
        checkbox_dependientes: document.getElementById('input_dependientes'),
        checkbox_profesional: document.getElementById('input_profesional'),
        checkbox_conyugue_a_cargo: document.getElementById('input_conyugue_a_cargo'),
        checkbox_hijos_a_cargo: document.getElementById('input_hijos_a_cargo'),
        button_agregar_dependiente: document.getElementById('agregar_dependiente'),

        // nodos para resultados
        table_dependientes: document.getElementById('dependientes'),
        div_profesional: document.getElementById('profesional'),
        span_salario_liquido: document.getElementById('salario_calculado'),
        td_montepio_porcentaje: document.getElementById('montepio_porcentaje'),
        td_montepio_total: document.getElementById('montepio_total'),
        td_montepio_porcentaje_bps: document.getElementById('montepio_porcentaje_bps'),
        td_montepio_total_bps: document.getElementById('montepio_total_bps'),
        td_montepio_porcentaje_afap: document.getElementById('montepio_porcentaje_afap'),
        td_montepio_total_afap: document.getElementById('montepio_total_afap'),
        td_fonasa_porcentaje: document.getElementById('fonasa_porcentaje'),
        td_fonasa_total: document.getElementById('fonasa_total'),
        td_frl_porcentaje: document.getElementById('frl_porcentaje'),
        td_frl_total: document.getElementById('frl_total'),
        td_bps_total_porcentaje: document.getElementById('bps_total_porcentaje'),
        td_bps_total: document.getElementById('bps_total'),
        td_total_deducciones: document.getElementById('total_deducciones'),
        td_tasa_deducciones: document.getElementById('tasa_deducciones'),
        td_final_deducciones: document.getElementById('final_deducciones'),
        table_detalle_irpf: document.getElementById('detalle_irpf').querySelector('tbody'),
        table_detalle_profesional: document.getElementById('detalle_profesionales'),
        td_monto_imponible: document.getElementById('monto_imponible'),
        td_irpf_total_sd: document.getElementById('irpf_total_sd'),
        td_irpf_total_sd_tasa: document.getElementById('irpf_total_sd_tasa'),
        td_irpf_total_cd: document.getElementById('irpf_total_cd'),
        td_irpf_total_cd_tasa: document.getElementById('irpf_total_cd_tasa'),
        td_fsol_total: document.getElementById('fsol_total'),
        td_cjppu_total: document.getElementById('cjppu_total'),

        // conteo de dependientes
        dependientes_agregados: 0,

        // formato de números
        formato_monto: new Intl.NumberFormat('es-UY', {
                style: 'currency',
                currencyDisplay: 'symbol',
                currency: 'UYU'
            }).format,
        formato_porcentaje: new Intl.NumberFormat('es-UY', {
                minimumFractionDigits: 1,
                style: 'percent'
            }).format,

        escribir_valores() {
            this.span_salario_liquido.textContent = UI.formato_monto(Programa.salario_liquido);
            this.td_montepio_porcentaje.textContent = UI.formato_porcentaje(Parametros.tasa_aportes_jubilatorios);
            this.td_montepio_total.textContent = UI.formato_monto(Programa.aportes_jubilatorios);
            this.td_fonasa_porcentaje.textContent = UI.formato_porcentaje(Programa.porcentaje_fonasa);
            this.td_fonasa_total.textContent = UI.formato_monto(Programa.aportes_fonasa);
            this.td_frl_porcentaje.textContent = UI.formato_porcentaje(Parametros.tasa_frl);
            this.td_frl_total.textContent = UI.formato_monto(Programa.aportes_frl);
            this.td_bps_total_porcentaje.textContent = UI.formato_porcentaje(
                Programa.porcentaje_fonasa +
                Parametros.tasa_aportes_jubilatorios +
                Parametros.tasa_frl);
            this.td_bps_total.textContent = UI.formato_monto(Programa.aportes_jubilatorios + Programa.aportes_fonasa + Programa.aportes_frl);

            if (this.checkbox_profesional.checked) {
                this.table_detalle_profesional.style.display = "table";
                this.div_profesional.style.display = 'table';
            } else {
                this.table_detalle_profesional.style.display = "none";
                this.div_profesional.style.display = 'none';
            }

            this.td_total_deducciones.textContent = UI.formato_monto(Programa.total_deducciones);
            this.td_tasa_deducciones.textContent = UI.formato_porcentaje(Programa.tasas_aplicables.tasa_deducciones);
            this.td_final_deducciones.textContent = UI.formato_monto(Programa.total_deducciones * Programa.tasas_aplicables.tasa_deducciones);

            var total_irpf = Programa.detalle_irpf.reduce((a, b) => a+b, 0);
            var total_irpf_cd = Math.max(0, total_irpf - Programa.total_deducciones * Programa.tasas_aplicables.tasa_deducciones);
            var tasa_irpf_cd = 0;
            if (Programa.salario_nominal > 0) {
                tasa_irpf_cd = total_irpf_cd / Programa.salario_nominal;
            }
            var doc_detalle_irpf = new DocumentFragment();
            Parametros.franjas_irpf.forEach((franja, i) => {
                //if (Programa.detalle_irpf[i] > 0 || franja.tasa === 0) {
                    var tr = document.createElement('tr');
                    var td1 = document.createElement('td');
                    var td2 = document.createElement('td');
                    var td3 = document.createElement('td');
                    var td4 = document.createElement('td');
                    td1.textContent = franja.de;
                    td2.textContent = (franja.a == Number.MAX_SAFE_INTEGER) ? '∞' : franja.a;
                    td3.textContent = UI.formato_porcentaje(franja.tasa);
                    td4.textContent = UI.formato_monto(Programa.detalle_irpf[i]);
                    tr.appendChild(td1);
                    tr.appendChild(td2);
                    tr.appendChild(td3);
                    tr.appendChild(td4);
                    doc_detalle_irpf.appendChild(tr);
                //}
            });

            this.table_detalle_irpf.textContent = '';
            this.table_detalle_irpf.appendChild(doc_detalle_irpf);
            this.td_irpf_total_cd.textContent = UI.formato_monto(total_irpf_cd);
            this.td_irpf_total_cd_tasa.textContent = UI.formato_porcentaje(tasa_irpf_cd);
            this.td_monto_imponible.textContent = UI.formato_monto(Programa.monto_gravado);
            this.td_fsol_total.textContent = UI.formato_monto(Programa.aportes_fsol);
            this.td_cjppu_total.textContent = UI.formato_monto(Programa.aportes_cjppu);

            if (Programa.salario_nominal >= Parametros.franjas_afap[0].hasta) {
                this.input_tiene_afap.checked = true;
                this.input_tiene_afap.disabled = true;
            } else {
                this.input_tiene_afap.disabled = false;
            }

            var montepio_bps = 0;
            if (this.input_tiene_afap.checked) {
                if (this.input_articulo8.checked) {
                    if (Programa.salario_nominal <= Parametros.franjas_afap[0].hasta) {
                        montepio_bps = Programa.aportes_jubilatorios / 2;
                    } else if (Programa.salario_nominal <= Parametros.franjas_afap[1].hasta) {
                        montepio_bps = Parametros.franjas_afap[0].hasta * Parametros.tasa_aportes_jubilatorios / 2;
                        montepio_bps += (Programa.salario_nominal - Parametros.franjas_afap[0].hasta) * Parametros.tasa_aportes_jubilatorios;
                    } else {
                        montepio_bps = Parametros.franjas_afap[0].hasta * Parametros.tasa_aportes_jubilatorios;
                    }
                } else {
                    montepio_bps = Math.min(Programa.salario_nominal, Parametros.franjas_afap[0].hasta) * Parametros.tasa_aportes_jubilatorios;
                }
            } else {
                montepio_bps = Programa.aportes_jubilatorios;
            }
            if (Programa.aportes_jubilatorios > 0) {
                var montepio_porcentaje_bps = montepio_bps / Programa.aportes_jubilatorios * Parametros.tasa_aportes_jubilatorios;
                var montepio_porcentaje_afap = Parametros.tasa_aportes_jubilatorios - montepio_porcentaje_bps;
            } else {
                var montepio_porcentaje_bps = 0;
                var montepio_porcentaje_afap = 0;
            }
            this.td_montepio_total_bps.textContent = UI.formato_monto(montepio_bps);
            this.td_montepio_total_afap.textContent = UI.formato_monto(Programa.aportes_jubilatorios - montepio_bps);
            this.td_montepio_porcentaje_bps.textContent = UI.formato_porcentaje(montepio_porcentaje_bps);
            this.td_montepio_porcentaje_afap.textContent = UI.formato_porcentaje(montepio_porcentaje_afap);
        },

        agregar_fila_dependiente() {
            var tr = document.createElement('tr');
            var td1 = document.createElement('td');
            var td2 = document.createElement('td');
            var td3 = document.createElement('td');
            var td4 = document.createElement('td');
            var boton_quitar = document.createElement('button');
            var checkbox_discapacidad = document.createElement('input');
            var select_porcentaje = document.createElement('select');
            var option_porcentaje50 = document.createElement('option');
            var option_porcentaje100 = document.createElement('option');
            var tbody = this.table_dependientes.querySelector('tbody');
            var id_dependiente = this.dependientes_agregados;

            td1.textContent = id_dependiente + 1;

            option_porcentaje50.setAttribute('value', 0.5);
            option_porcentaje50.textContent = "50 %";
            option_porcentaje100.textContent = "100 %";
            option_porcentaje100.setAttribute('value', 1);
            option_porcentaje100.setAttribute('selected', true);
            select_porcentaje.appendChild(option_porcentaje50);
            select_porcentaje.appendChild(option_porcentaje100);
            td2.appendChild(select_porcentaje);

            checkbox_discapacidad.setAttribute('type', 'checkbox');
            td3.appendChild(checkbox_discapacidad);

            boton_quitar.textContent = '-';
            td4.appendChild(boton_quitar);

            tr.appendChild(td1);
            tr.appendChild(td2);
            tr.appendChild(td3);
            tr.appendChild(td4);

            tbody.append(tr);
            this.dependientes_agregados++;

            select_porcentaje.addEventListener('change', (e) => this.actualizar());
            checkbox_discapacidad.addEventListener('change', (e) => this.actualizar());
            boton_quitar.addEventListener('click', (e) => {
                try {
                this.quitar_dependiente(boton_quitar.closest('tr'));
                } catch(e) {
                    console.log(e);
                }
                this.actualizar();
                e.stopPropagation(); e.preventDefault();
            });
        },

        quitar_dependiente(tr) {
            this.table_dependientes.querySelector('tbody').removeChild(tr);
        },

        actualizar() {
            var aportes_fsol = 0;
            var aporta_adicional_fsol = false;
            var aportes_cjppu = 0;
            var dependientes = [];
            if (this.checkbox_profesional.checked) {
                aportes_fsol = parseFloat(this.input_fsol.value);
                aporta_adicional_fsol = this.checkbox_adicional_fsol.checked;
                aportes_cjppu = parseInt(this.input_cjppu.value);
            }
            if (this.checkbox_dependientes.checked) {
                var dependientes_dom = this.table_dependientes.querySelectorAll('tbody tr');
                var dependientes = Array.prototype.map.apply(dependientes_dom, [(fila) => ({
                    porcentaje: fila.querySelector('td select').value,
                    discapacidad: fila.querySelector('td input[type="checkbox"]').checked
                })]);
            }

            Programa.actualizar(
                this.input_salario_nominal.value,
                this.input_bpc.value,
                this.checkbox_conyugue_a_cargo.checked,
                this.checkbox_hijos_a_cargo.checked,
                dependientes,
                aportes_fsol,
                aporta_adicional_fsol,
                aportes_cjppu,
                parseInt(this.input_otras_deducciones.value),
            );
            this.escribir_valores();
        },

        mostrar_ocultar(elemento, elemento_destino, display_visible) {
            elemento_destino.style.display = (elemento.checked) ? display_visible : 'none';
        },

        event_listeners() {
            this.checkbox_dependientes.addEventListener('change', (e) => {
                this.mostrar_ocultar(e.target, this.table_dependientes, 'table');
            });

            this.input_salario_nominal.addEventListener('input', (e) => this.actualizar());
            this.input_bpc.addEventListener('input', (e) => this.actualizar());
            this.input_cjppu.addEventListener('input', (e) => this.actualizar());
            this.input_otras_deducciones.addEventListener('input', (e) => this.actualizar());
            this.input_fsol.addEventListener('change', (e) => this.actualizar());
            this.input_tiene_afap.addEventListener('change', (e) => this.actualizar());
            this.input_articulo8.addEventListener('change', (e) => this.actualizar());
            this.checkbox_profesional.addEventListener('change', (e) => this.actualizar());
            this.checkbox_conyugue_a_cargo.addEventListener('change', (e) => this.actualizar());
            this.checkbox_hijos_a_cargo.addEventListener('change', (e) => this.actualizar());
            this.checkbox_dependientes.addEventListener('change', (e) => this.actualizar());
            this.checkbox_adicional_fsol.addEventListener('change', (e) => this.actualizar());
            this.button_agregar_dependiente.addEventListener('click', (e) => {
                this.agregar_fila_dependiente();
                this.actualizar();
                e.stopPropagation(); e.preventDefault();
            });
        },

        init() {
            document.getElementById('ayuda_afap').textContent = UI.formato_monto(Parametros.franjas_afap[0].hasta);
            document.getElementById('ayuda_montepio').textContent = UI.formato_monto(Parametros.franjas_afap[2].hasta * Parametros.tasa_aportes_jubilatorios) + ' (' + UI.formato_porcentaje(Parametros.tasa_aportes_jubilatorios) + ' de ' + UI.formato_monto(Parametros.franjas_afap[2].hasta) + ')';
            document.getElementById('ayuda_monto_imponible').textContent = '10 BPC (' + UI.formato_monto(Parametros.valor_bpc * 10) + ')';
            this.event_listeners();
            this.input_salario_nominal.value = 0;
            this.input_bpc.value = Parametros.valor_bpc;
            this.actualizar();
        },
    };
    
    UI.init();
});
