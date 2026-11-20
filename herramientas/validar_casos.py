# -*- coding: utf-8 -*-
"""Validador de casos clínicos (formato v1).
Uso:  python3 validar_casos.py casos_clinicos_100.json
Acepta un archivo con UN caso (objeto) o con VARIOS (lista). Imprime errores y avisos."""
import json, sys, re

NIVELES={"Básico","Intermedio","Avanzado"}
MODOS={"clasico","urgente"}
RELEVANCIA={"clave","util","ruido"}
ROLES={"principal","no_dejar_escapar","plausible","distractor"}
VALOR_PRUEBA={"imprescindible","razonable","bajo_valor","no_procede","peligrosa"}
CAT_PLAN={"imprescindible","razonable","condicional","bajo_valor","peligrosa"}
GRAVEDAD={"leve","grave","critico"}
RITMOS={"sinusal","taquicardia_sinusal","bradicardia_sinusal","fibrilacion_auricular","flutter_auricular",
        "taquicardia_supraventricular","taquicardia_ventricular","fibrilacion_ventricular","elevacion_st",
        "bloqueo_av_completo","asistolia","actividad_electrica_sin_pulso","hiperpotasemia_grave"}
ESPEC={"Urgencias","Infecciosas","Neurología","Cardiología","Nefrología","Endocrinología","Hematología","Neumología",
       "Oncología","Ginecología","Digestivo","Dermatología","Psiquiatría","Reumatología"}
MON_KEYS={"ritmo","fc","spo2","ta","fr","temp"}

def validar(c, errs, avisos):
    cid=c.get("id","?")
    def E(m): errs.append(f"[{cid}] {m}")
    def A(m): avisos.append(f"[{cid}] {m}")
    req=["version","id","motivo","especialidad","nivel","minutos_estimados","modo","paciente","escenario","diagnostico",
         "anamnesis","exploracion","monitor","hipotesis","pruebas","plan","trampas","razonamiento","finales","objetivos",
         "para_recordar","reto","bibliografia","pendiente_verificar"]
    for k in req:
        if k not in c: E(f"falta el campo '{k}'")
    if errs and any(x.startswith(f"[{cid}] falta") for x in errs): return
    if not re.fullmatch(r"\d{3}",str(c["id"])): E("id debe tener 3 dígitos")
    if c["especialidad"] not in ESPEC: E(f"especialidad no válida: {c['especialidad']}")
    if c["nivel"] not in NIVELES: E("nivel no válido")
    if c["modo"] not in MODOS: E("modo no válido")
    p=c["paciente"]
    for k in ["nombre","sexo","edad","ocupacion","descripcion_imagen"]:
        if k not in p: E(f"paciente.{k} falta")
    if isinstance(p.get("edad"),int) and p["edad"]<18: E("el paciente debe ser adulto (>=18)")
    for k in ["lugar","momento","triaje","al_entrar"]:
        if k not in c["escenario"]: E(f"escenario.{k} falta")
    d=c["diagnostico"]
    if not d.get("principal"): E("diagnostico.principal vacío")
    if len(d.get("terminos_aceptados",[]))<4: E("diagnostico.terminos_aceptados debe tener al menos 4 sinónimos/siglas")
    ids=set(); n_q=0; claves=0
    if not (4<=len(c["anamnesis"])<=7): A("anamnesis: se esperan 4 a 7 grupos")
    for g in c["anamnesis"]:
        for q in g.get("preguntas",[]):
            n_q+=1
            for k in ["id","pregunta","respuesta","relevancia","dato"]:
                if k not in q: E(f"pregunta sin '{k}': {q.get('id')}")
            if q.get("relevancia") not in RELEVANCIA: E(f"relevancia no válida en {q.get('id')}")
            if q.get("relevancia")=="clave": claves+=1
            if q.get("id") in ids: E(f"id repetido {q.get('id')}")
            ids.add(q.get("id"))
    if not (14<=n_q<=24): A(f"anamnesis tiene {n_q} preguntas (se esperan 14 a 24)")
    if claves<3: A("pocas preguntas 'clave' (mínimo 3)")
    ex=c["exploracion"]
    for k in ["TA","FC","FR","SatO2","T"]:
        if k not in ex.get("constantes",{}): E(f"constantes.{k} falta")
    regs=ex.get("regiones",[])
    if len(regs)<7: E("exploracion.regiones: mínimo 7")
    if not any(r.get("clave") for r in regs): E("al menos una región debe ser clave:true")
    for r in regs:
        for k in ["region","hallazgo","clave","valor_semiologico"]:
            if k not in r: E(f"región sin '{k}'")
    m=c["monitor"]
    if not MON_KEYS<=set(m): E("monitor incompleto")
    elif m["ritmo"] not in RITMOS: E(f"ritmo no válido: {m['ritmo']}")
    h=c["hipotesis"]
    if len(h)<5: E("hipotesis: mínimo 5")
    if sum(1 for x in h if x.get("rol")=="principal")!=1: E("debe haber exactamente 1 hipótesis 'principal'")
    for x in h:
        if x.get("rol") not in ROLES: E(f"rol de hipótesis no válido: {x.get('rol')}")
    pr=c["pruebas"]
    if not (6<=len(pr)<=10): A(f"pruebas: {len(pr)} (se esperan 6 a 10)")
    pid=set()
    for x in pr:
        for k in ["id","nombre","minutos","valor","resultado","imagen","interpretacion"]:
            if k not in x: E(f"prueba sin '{k}': {x.get('id')}")
        if x.get("valor") not in VALOR_PRUEBA: E(f"valor de prueba no válido: {x.get('valor')}")
        if x.get("id") in pid: E(f"id de prueba repetido {x.get('id')}")
        pid.add(x.get("id"))
    pl=c["plan"]
    if not (8<=len(pl)<=12): A(f"plan: {len(pl)} medidas (se esperan 8 a 12)")
    for x in pl:
        for k in ["id","medida","categoria","justificacion"]:
            if k not in x: E(f"medida sin '{k}': {x.get('id')}")
        if x.get("categoria") not in CAT_PLAN: E(f"categoría de plan no válida: {x.get('categoria')}")
    if not any(x.get("categoria")=="imprescindible" for x in pl): E("el plan no tiene ninguna medida imprescindible")
    if not any(x.get("categoria")=="peligrosa" for x in pl): A("el plan no tiene ninguna medida peligrosa")
    tr=c["trampas"]
    if len(tr)<5: E("trampas: mínimo 5")
    for x in tr:
        for k in ["error","gravedad","condicion"]:
            if k not in x: E(f"trampa sin '{k}'")
        if x.get("gravedad") not in GRAVEDAD: E(f"gravedad no válida: {x.get('gravedad')}")
    for k in ["sintomas_a_hipotesis","pruebas_a_diagnostico","manejo"]:
        if k not in c["razonamiento"]: E(f"razonamiento.{k} falta")
    for k in ["bien","tarde","mal"]:
        if k not in c["finales"]: E(f"finales.{k} falta")
    if len(c["objetivos"])<3: E("objetivos: mínimo 3")
    if len(c["para_recordar"])!=3: E("para_recordar debe tener exactamente 3 ideas")
    r=c["reto"]
    if not all(k in r for k in ["pregunta","opciones","correcta","explicacion"]): E("reto incompleto")
    elif not (len(r["opciones"])==4 and isinstance(r["correcta"],int) and 0<=r["correcta"]<4): E("reto: 4 opciones y 'correcta' entre 0 y 3")
    if len(c["bibliografia"])<3: E("bibliografia: mínimo 3 fuentes")
    # bloque urgente
    if c["modo"]=="urgente":
        u=c.get("urgente")
        if not u: E("modo urgente sin bloque 'urgente'"); return
        fs=u.get("fases",[])
        if len(fs)<3 or fs[0].get("id")!="llegada": E("urgente.fases: mínimo 3 y la primera debe ser 'llegada'")
        tids={t.get("id") for t in u.get("tratar",[])}
        for f in fs:
            if not MON_KEYS<=set(f.get("monitor",f.get("monitor_bien",{}))): E(f"fase {f.get('id')} con monitor incompleto")
            if f.get("id")!="llegada":
                for k in ["narrativa_bien","narrativa_mal","monitor_bien","monitor_mal","requiere_para_bien"]:
                    if k not in f: E(f"fase {f.get('id')} sin '{k}'")
                for t in f.get("requiere_para_bien",[]):
                    if t not in tids: E(f"requiere_para_bien cita {t} que no existe en 'tratar'")
        if len(u.get("tratar",[]))<6: E("urgente.tratar: mínimo 6 acciones")
        for t in u.get("tratar",[]):
            for k in ["id","nombre","minutos","valor","fases","efecto","reevaluar_antes_de_repetir"]:
                if k not in t: E(f"acción de tratar sin '{k}': {t.get('id')}")
            if t.get("valor") not in CAT_PLAN: E(f"valor de acción no válido: {t.get('valor')}")
        if not any(t.get("valor")=="peligrosa" for t in u.get("tratar",[])): A("urgente.tratar sin ninguna acción peligrosa")
        if not u.get("deterioro"): E("urgente.deterioro vacío")
        if "fin" not in u: E("urgente.fin falta")

def main(path):
    data=json.load(open(path,encoding="utf-8"))
    casos=data if isinstance(data,list) else [data]
    errs=[]; avisos=[]; ids=[]
    for c in casos:
        ids.append(c.get("id")); validar(c,errs,avisos)
    if len(ids)!=len(set(ids)): errs.append("hay ids de caso repetidos")
    print(f"Casos leídos: {len(casos)}  |  ERRORES: {len(errs)}  |  AVISOS: {len(avisos)}")
    for e in errs: print("ERROR ",e)
    for a in avisos: print("AVISO ",a)
    if not errs: print("OK: el archivo cumple el formato.")
    return 1 if errs else 0

if __name__=="__main__":
    sys.exit(main(sys.argv[1]) if len(sys.argv)>1 else print(__doc__) or 1)
