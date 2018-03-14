const canvas = document.getElementById('canvas');

const graph = new Graph(canvas);

function cust(x,y) {
    //let a = (x*x*x + 4*x*y - 5*y*y - 0.5*x*x*y) / 1000000;
    //let a = 10*Math.cos(x/100/y)*Math.exp(-x/100);

    let b = 100000;
    let a = 110*Math.cos(x/b)*Math.exp(-x/b + Math.sin(y*x/b) + Math.random()*Math.cos(b/(x*y+1))/1000);
    //let a = 10*Math.log(Math.abs(x*x - y*y))*Math.sin(x/100 - 100)*Math.cos(y/100);
    //let a = 100*Math.sin(x/100)+50;
    //let a = Math.sin(y)*x*x;
    return a;
	//return Math.sqrt(x*x+y*y) % 1 === 0 ? Math.sqrt(x*x+y*y) : 0;
    //return 200 - 5 * x - 3 * y;
}


graph.addSet(cust, {
    style: 'plates',
	lines: {
		visible: false
	},
    gridStep: 40,
});

graph.draw();


