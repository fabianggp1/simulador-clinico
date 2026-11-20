# -*- coding: utf-8 -*-
"""Prepara los casos para la página.

Uso:
  python3 herramientas/preparar_casos.py
      Reconstruye data/indice.json con lo que haya en data/casos/.
  python3 herramientas/preparar_casos.py casos_clinicos_100.json
      Separa la lista en data/casos/NNN.json y luego reconstruye el índice.

Agregar un caso nuevo NO exige cambiar el código: basta con dejar su archivo
en data/casos/ y volver a ejecutar este programa.
"""
import json, os, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASOS = os.path.join(RAIZ, "data", "casos")
IMG_PACIENTES = os.path.join(RAIZ, "imagenes", "pacientes")


def separar(ruta):
    with open(ruta, encoding="utf-8") as f:
        datos = json.load(f)
    lista = datos if isinstance(datos, list) else [datos]
    os.makedirs(CASOS, exist_ok=True)
    for c in lista:
        cid = str(c["id"])
        with open(os.path.join(CASOS, cid + ".json"), "w", encoding="utf-8") as f:
            json.dump(c, f, ensure_ascii=False, indent=1)
            f.write("\n")
    print(f"Casos escritos en data/casos/: {len(lista)}")


def indice():
    filas = []
    for nombre in sorted(os.listdir(CASOS)):
        if not nombre.endswith(".json"):
            continue
        with open(os.path.join(CASOS, nombre), encoding="utf-8") as f:
            c = json.load(f)
        cid = str(c["id"])
        filas.append({
            "id": cid,
            "archivo": "casos/" + nombre,
            "motivo": c["motivo"],
            "especialidad": c["especialidad"],
            "nivel": c["nivel"],
            "modo": c["modo"],
            "minutos_estimados": c["minutos_estimados"],
            "borrador": bool(c.get("borrador_revision_clinica", False)),
            "imagen": os.path.exists(os.path.join(IMG_PACIENTES, cid + ".png")),
        })
    filas.sort(key=lambda x: x["id"])
    with open(os.path.join(RAIZ, "data", "indice.json"), "w", encoding="utf-8") as f:
        json.dump({"version": 1, "casos": filas}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Índice reconstruido: {len(filas)} casos")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        separar(sys.argv[1])
    indice()
