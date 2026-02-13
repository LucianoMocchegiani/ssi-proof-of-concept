# Recursos para estudiar criptografía y curvas elípticas

Documento con recursos de aprendizaje y explicación de por qué cifrar es rápido pero recuperar la clave privada sin conocerla es computacionalmente inviable.

---

## Por qué cifrar es rápido y "descifrar sin clave" tarda millones de años

En curvas elípticas hay dos operaciones de coste muy distinto:

| Operación | Coste | Motivo |
|-----------|-------|--------|
| **Cifrar** / **Calcular P = d·G** / **Verificar** | Polinomial (rápido) | Operación directa: una multiplicación escalar o verificación |
| **Recuperar d** dado P y G | Exponencial (inviable) | Hay que probar ~2^256 valores posibles de d |

Es como una cerradura: cerrar es instantáneo; abrir sin llave probando todas las combinaciones tardaría siglos. La matemática nos da una operación "fácil" (d → P) y una "difícil" (P → d).

---

## Cursos y recursos recomendados

| Recurso | Qué cubre | Nivel |
|---------|-----------|-------|
| [Khan Academy - Criptografía](https://www.khanacademy.org/computing/computer-science/cryptography) | Introducción a conceptos de criptografía | Básico |
| [Crypto 101](https://www.crypto101.io/) | Libro gratuito, criptografía práctica | Intermedio |
| [Dan Boneh - Stanford (Coursera)](https://www.coursera.org/learn/crypto) | Criptografía aplicada, curvas elípticas | Intermedio-Avanzado |
| [Applied Cryptography - Bruce Schneier](https://www.schneier.com/books/applied-cryptography/) | Referencia clásica | Avanzado |
| [Elliptic-curve cryptography (Wikipedia)](https://en.wikipedia.org/wiki/Elliptic-curve_cryptography) | Curvas elípticas, matemática | Técnico |
| [Discrete logarithm (Wikipedia)](https://en.wikipedia.org/wiki/Discrete_logarithm) | Por qué es "difícil" invertir | Técnico |

---

## Temas a abordar (orden sugerido)

1. **Criptografía asimétrica** — claves pública/privada, RSA vs curvas elípticas
2. **Curvas elípticas** — puntos, suma en la curva, multiplicación escalar (d·G)
3. **Problema del logaritmo discreto** — por qué P→d es "imposible" en la práctica
4. **Complejidad computacional** — polinomial vs exponencial

El curso de Dan Boneh en Coursera suele ser la puerta de entrada más clara.
