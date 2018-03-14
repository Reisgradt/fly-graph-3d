## Fly-graph-3d
Библиотека, использующая three.js, для отрисовки 3d графиков. Камерой можно управлять и летать в пространстве (WASD + RF для подъёма/спуска), график же отрисовывается дальше при движении камеры.

![Пример графика](https://github.com/Reisgradt/fly-graph-3d/blob/master/example.PNG "Пример графика")

### Пример использования
```javascript
/* Выбираем canvas-элемент */
const canvas = document.getElementById('canvas');

/* Создаём объект графика */
const graph = new Graph(canvas);

/* Создаём пользовательскую функцию */
function cust(x,y) {
    let b = 100000;
    let a = 110*Math.cos(x/b)*Math.exp(-x/b + Math.sin(y*x/b) + Math.random()*Math.cos(b/(x*y+1))/1000);
    return a;
}

/* Добавляем график и его настройки */
graph.addSet(cust, {
    style: 'plates',
	lines: {
		visible: false
	},
    gridStep: 40,
});

/* Отрисовка графика */
graph.draw();
```
