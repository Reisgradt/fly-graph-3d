/**
 * Контроллер для управления камерой
 * Стандартное управление WASD
 * Вверх/вниз R/F
 * Повороты камеры при нажатии мышью по canvas
 */
class GraphControls {
    constructor(camera, canvas) {
        this.object = camera;
        this.target = new THREE.Vector3(0, 0, 0);

        this.movementSpeed = 1000;
        this.lookSpeed = 1;
        this.shiftSpeed = 3000;

        this.lat = 0;
        this.lon = 0;

        this.phi = 0;
        this.theta = 0;

        this.mouseRelative = {
            x: 0,
            y: 0
        };

        this.mouseDown = {
            x: 0,
            y: 0
        };

        this.moveVector = {
            x: 0,
            y: 0,
            z: 0
        };

        this.moveState = {
            forward: 0,
            back: 0,
            left: 0,
            right: 0,

            up: 0,
            down: 0,

            speeded: 0
        };

        this.isDown = false;

        canvas.addEventListener('mousedown', this._mousedown.bind(this));
        window.addEventListener('mouseup', this._mouseup.bind(this));
        window.addEventListener('mousemove', this._mousemove.bind(this));

        window.addEventListener('keydown', this._keydown.bind(this));
        window.addEventListener('keyup', this._keyup.bind(this));
    }

    update(delta) {
        let actualMoveSpeed = delta * (this.moveState.speeded ? this.shiftSpeed : this.movementSpeed),
            actualLookSpeed = delta * this.lookSpeed;

        this.lat -= this.mouseRelative.y * actualLookSpeed; // * verticalLookRatio
        this.lat = Math.max(-85, Math.min(85, this.lat));
        this.lon += this.mouseRelative.x * actualLookSpeed;

        this.phi = THREE.Math.degToRad(90 - this.lat);
        this.theta = THREE.Math.degToRad(this.lon);

        let targetPosition = this.target,
            position = this.object.position;

        this.object.translateX(this.moveVector.x * actualMoveSpeed);
        this.object.translateY(this.moveVector.y * actualMoveSpeed);
        this.object.translateZ(this.moveVector.z * actualMoveSpeed);

        targetPosition.x = position.x + 100 * Math.sin(this.phi) * Math.cos(this.theta);
        targetPosition.y = position.y + 100 * Math.cos(this.phi);
        targetPosition.z = position.z + 100 * Math.sin(this.phi) * Math.sin(this.theta);

        this.object.lookAt(targetPosition);
    }

    updateMovementVector() {
        this.moveVector.x = this.moveState.right - this.moveState.left;
        this.moveVector.y = this.moveState.up - this.moveState.down;
        this.moveVector.z = this.moveState.back - this.moveState.forward;
    }

    _mousedown(e) {
        this.isDown = true;

        this.mouseDown.x = e.clientX;
        this.mouseDown.y = e.clientY;
    }

    _mouseup(e) {
        this.isDown = false;

        this.mouseRelative.x = 0;
        this.mouseRelative.y = 0;
    }

    _mousemove(e) {
        if (this.isDown) {
            this.mouseRelative.x = e.clientX - this.mouseDown.x;
            this.mouseRelative.y = e.clientY - this.mouseDown.y;
        }
    }

    _keydown(e) {
        if (e.altKey)
            return;

        switch (e.keyCode) {
            case 16:
                /* shift */ this.moveState.speeded = 1;
                break;

            case 87:
                /*W*/ this.moveState.forward = 1;
                break;
            case 83:
                /*S*/ this.moveState.back = 1;
                break;

            case 65:
                /*A*/ this.moveState.left = 1;
                break;
            case 68:
                /*D*/ this.moveState.right = 1;
                break;

            case 82:
                /*R*/ this.moveState.up = 1;
                break;
            case 70:
                /*F*/ this.moveState.down = 1;
                break;
        }

        this.updateMovementVector();
    }

    _keyup(e) {
        switch (e.keyCode) {
            case 16:
                /* shift */ this.moveState.speeded = 0;
                break;

            case 87:
                /*W*/ this.moveState.forward = 0;
                break;
            case 83:
                /*S*/ this.moveState.back = 0;
                break;

            case 65:
                /*A*/ this.moveState.left = 0;
                break;
            case 68:
                /*D*/ this.moveState.right = 0;
                break;

            case 82:
                /*R*/ this.moveState.up = 0;
                break;
            case 70:
                /*F*/ this.moveState.down = 0;
                break;
        }

        this.updateMovementVector();
    }
}

//Массив чанков, необходимых для отрисовки
//callback()
class ChunkBuffer {
    constructor(calcSetCallback, graphBuilder) {
        //{direction: {x:-1, y:0, z:1}, mesh: THREE.Mesh, position: {x: 1, y: 2, z: 3}, _old: false}
        this.buffer = [];
        let { scale } = graphBuilder.globalOptions;
        this.calcSetCallback = calcSetCallback;

        this.camera = graphBuilder.camera;
        this.scene = graphBuilder.scene;
        this.cameraFar = graphBuilder.globalOptions.cameraFar;
    }

    /**
     * Проверяет на полное наличие чанков своему положению
     * Если чего-то не хватает из 27 областей, то заменяет
     * устаревшие новыми зонами или же поправляет их направление
     */
    updateBuffer(initFlag = false) {
        /*
            Получить текущее положение
            Сравнить, всё ли соответствует реальности
            Если нет, то...
            Проверить, какие зоны необходимо перезаписать полностью
            А какие только изменить по направленности
        */
        if (!(this.positionChanged() || initFlag))
            return;

        let currentMiddleChunkPos = this.normalizeCoords(this.camera.position);

        let chunkPositions = []; // {position: {}, direction: {}}

        //Высчитываем всевозможные позиции и направления нового положения чанков
        this.getFullDirections().forEach(direction => {
            chunkPositions.push({
                position: this.relativityPos(currentMiddleChunkPos, direction),
                direction: direction
            });
        });

        //Отмечаем элементы буффера как старые, чтобы обновить позже
        this.buffer.forEach(item => {
            item._old = true;
        });

        //Запись в buffer всего, что должно быть в обновлённой версии
        chunkPositions.forEach(item => {
            if (this.hasChunkWithThisPos(item.position)) {
                /* Если чанк нужно сохранить, просто поменяв его индекс */
                for (let i = 0; i < this.buffer.length; ++i) {
                    if (ChunkBuffer.comparePositions(item.position, this.buffer[i].position)) {
                        this.buffer[i].direction = item.direction;
                        this.buffer[i]._old = false;
                        break;
                    }
                }
            } else {
                /* Если надо достроить чанк графика */
                this.buffer.push({
                    mesh: this.calcSetCallback(item.position),
                    position: item.position,
                    direction: item.direction,
                    _old: false
                });
            }
        });

        //Удаление старых чанков
        this.buffer.forEach(item => {
            if (item._old) {
                let index = this.buffer.indexOf(item);
                if (index != -1) {
                    this.scene.remove(this.buffer[index].mesh);
                    this.buffer.splice(index, 1);
                }
            }
        });

    }

    /**
     * Стоит ли обновлять чанки или нет?
     * @returns {boolean} True, если нормализованная позиция камеры не совпадает с центральным чанком
     */
    positionChanged() {
        return !this.compareCurrentPosition( this.normalizeCoords(this.camera.position) );
    }

    /**
     * Сравнивает переданную позицию с позицией центрального чанка
     * @param   {object}  position Типичный объект координат
     * @returns {boolean} True, если текущая позиция равна позиции центрального чанка
     */
    compareCurrentPosition(position) {
        let currentPos = this.getPosition({
            x: 0,
            y: 0,
            z: 0
        });
        return position.x === currentPos.x &&
            position.y === currentPos.y &&
            position.z === currentPos.z;
    }

    static comparePositions(pos1, pos2) {
        return pos1.x === pos2.x &&
            pos1.y === pos2.y &&
            pos1.z === pos2.z;
    }

    /**
     * Возвращает координаты чанка заданного направлением
     * @param   {object} direction Объект типа {x:1,y:0,z:-1}
     * @returns {object} В случае найденного направления вернёт координаты чанка
     */
    getPosition(direction) {
        for (let i = 0; i < this.buffer.length; ++i) {
            if (ChunkBuffer.comparePositions(direction, this.buffer[i].direction)) {
                return this.buffer[i].position;
            }
        }
        return false;
    }

    hasChunkWithThisPos(position) {
        for (let i = 0; i < this.buffer.length; ++i) {
            if (ChunkBuffer.comparePositions(position, this.buffer[i].position)) {
                return true;
            }
        }
        return false;
    }

    // ##### #####
    relativityPos(pos, relativity) {
        return {
            x: pos.x + relativity.x * this.cameraFar,
            y: pos.y + relativity.y * this.cameraFar,
            z: pos.z + relativity.z * this.cameraFar
        };
    }

    getFullDirections() {
        let allDirections = [];
        for (let x = -1; x <= 1; ++x) {
            for (let y = -1; y <= 1; ++y) {
                for (let z = -1; z <= 1; ++z)
                    allDirections.push({
                        x,
                        y,
                        z
                    });
            }
        }
        return allDirections;
    }

    normalizeCoords(position) {
        let middleChunkPos = {};

        //Отбрасывание дробной части. Перебор по координатам камеры
        Object.keys(position).forEach(key => {
            middleChunkPos[key] = (position[key] - position[key] % this.cameraFar);
        });

        return middleChunkPos;
    }
}

class Graph {
    constructor(canvasObj, options = {}) {
        let defaultOptions = {
            bgColor: '#ffffff', //Изначально белый цвет
            cameraFar: 5000,
            scale: 1
        };
        this.globalOptions = Graph.deepParseOpt(defaultOptions, options);

        this.canvas = canvasObj;
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvasObj
        });
        this.camera = new THREE.PerspectiveCamera(45, this.canvas.width / this.canvas.height, 0.1, this.globalOptions.cameraFar);

        this.controls = new GraphControls(this.camera, this.canvas);
        this.clock = new THREE.Clock();

        this.controls.movementSpeed = 1000;
        this.controls.lookSpeed = 1;
        this.controls.shiftSpeed = 3000;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.scene = {};
        this.isDraw = false; //Запущен ли цикл отрисовки
        this.chunkBuffer = {};
        //Массив функций и их настроек
        //{func: function (x,y){}, opt: {}},
        this.graphBuffer = [];

        this.canvas.addEventListener('resize', this.onWindowResize.bind(this));
    }

    // Добавление данных
    addSet(data, opt = {}) {
        if ("function" === typeof data) {
            this.graphBuffer.push({
                func: data,
                opt: Graph.deepParseOpt(Graph.defaultGraphProperties, opt)
            });
        } else {
            console.error("Graph.addSet: The first parameter must be a function");
        }
    }

    clearSets() {
        this.graphBuffer = [];
    }

    // Отрисовка графиков
    /**
     * Запускает цикл отрисовки, создаёт новую сцену, инициализируется необходимое
     */
    draw() {
        this.isDraw = true;
        this.initCanvas();
        this.loop();
    }

    /**
     * Цикл отрисовки, в котором рендерятся все объекты на сцене
     */
    loop() {
        if (this.isDraw) {
            this.controls.update(this.clock.getDelta());
            this.graphBuffer.forEach(item => {
                item.chunkBuffer.updateBuffer();
            });

            this.renderer.render(this.scene, this.camera);
            requestAnimationFrame(this.loop.bind(this ));
        }
    }

    /**
     * Инициализация новой сцены и всех параметров
     */
    initCanvas() {
        this.scene = new THREE.Scene();
        this.drawAxis();
        this.renderer.setClearColor(this.workspace.bgColor);
        this.camera.position.set(0, 0, 0);
        this.camera.lookAt(0, 0, 0);

        this.graphBuffer.forEach(item => {
            if (item.func !== undefined) {
                item.chunkBuffer = new ChunkBuffer(this.graphDrawer(item).bind(this), this);
                item.chunkBuffer.updateBuffer(true);
            } else {
                console.error("Graph.initCanvas: Item of graphBuffer does't contain properties 'func'");
            }
        });
    }

    setCameraPos(position) {
        this.camera.position.set(position.x, position.y, position.z);
    }

    graphDrawer(graphObj) {
        let { cameraFar, scale } = this.globalOptions;

        let options = graphObj.opt,
            graphFunc = (x, z) => graphObj.func.apply(null, [x / scale, z / scale]) * scale;

        function chooserStyle(startPosition) {
            let chunkMesh = new THREE.Object3D();

            if (options.style == 'grid') {
                chunkMesh.add(gridStyleDrawer(startPosition));
            } else if (options.style == 'zLines') {
                chunkMesh.add(_simpleGrid(startPosition, 'zLines'));
            } else if (options.style == 'xLines') {
                chunkMesh.add(_simpleGrid(startPosition, 'xLines'));
            } else if (options.lines.visible + '' == 'true') {
                chunkMesh.add(gridStyleDrawer(startPosition));
            }

            if (options.dots.visible + '' == 'true') {
                chunkMesh.add(dotsStyleDrawer(startPosition));
            }

            if (options.style == 'plates') {
                chunkMesh.add(platesStyleDrawer(startPosition));
            }

            this.scene.add(chunkMesh);
            return chunkMesh;
        }

        function gridStyleDrawer(startPosition) {
            let chunkMesh = new THREE.Object3D();

            chunkMesh.add(_simpleGrid(startPosition, 'xLines'));
            chunkMesh.add(_simpleGrid(startPosition, 'zLines'));

            return chunkMesh;
        }

        // ##### #####
        function dotsStyleDrawer(startPosition) {
            let chunkMesh = new THREE.Object3D(),
                material = new THREE.PointsMaterial({
                    size: options.dots.width,
                    color: options.dots.color
                });

            let gridStep = options.gridStep;

            let geometry = new THREE.BufferGeometry(),
                positions = new Float32Array(
                    Math.pow(Math.ceil(cameraFar / gridStep), 2) * 3 + 6 * Math.ceil(cameraFar / gridStep)
                );

            let k = 0;
            for (let x = startPosition.x; x <= startPosition.x + cameraFar; x += gridStep) {
                for (let z = startPosition.z; z <= startPosition.z + cameraFar; z += gridStep) {

                    positions[k + 0] = x;
                    positions[k + 1] = graphFunc(x, z);
                    positions[k + 2] = z;

                    k += 3;
                }
            }

            geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
            chunkMesh.add(new THREE.Points(geometry, material));

            return chunkMesh;
        }

        // ##### #####
        function platesStyleDrawer(startPosition) {
            let triangles = Math.ceil(
                2 * (cameraFar * cameraFar) / (options.gridStep * options.gridStep) + 4 * cameraFar / options.gridStep
            );

            let positions = new Float32Array(triangles * 3 * 3),
                normals = new Float32Array(triangles * 3 * 3);

            let geometry = new THREE.BufferGeometry(),
                chunkMesh = new THREE.Object3D(),
                material = new THREE.MeshBasicMaterial({
                    color: options.plates.color
                });
            let gridStep = options.gridStep;


            let pA = new THREE.Vector3(),
                pB = new THREE.Vector3(),
                pC = new THREE.Vector3(),
                cb = new THREE.Vector3(),
                ab = new THREE.Vector3();


            var k = 0;
            for (let x = startPosition.x; x <= startPosition.x + cameraFar; x += gridStep) {
                for (let z = startPosition.z; z <= startPosition.z + cameraFar; z += gridStep) {
                    // positions
                    // first traingle in cell
                    positions[18 * k + 0] = x;
                    positions[18 * k + 1] = graphFunc(x, z);
                    positions[18 * k + 2] = z;

                    positions[18 * k + 3] = x + gridStep;
                    positions[18 * k + 4] = graphFunc(x + gridStep, z);
                    positions[18 * k + 5] = z;

                    positions[18 * k + 6] = x;
                    positions[18 * k + 7] = graphFunc(x, z + gridStep);
                    positions[18 * k + 8] = z + gridStep;


                    pA.set(positions[18 * k + 0],
                        positions[18 * k + 1],
                        positions[18 * k + 2]);
                    pB.set(positions[18 * k + 3],
                        positions[18 * k + 4],
                        positions[18 * k + 5]);
                    pC.set(positions[18 * k + 6],
                        positions[18 * k + 7],
                        positions[18 * k + 8]);

                    cb.subVectors(pC, pB);
                    ab.subVectors(pA, pB);
                    cb.cross(ab);
                    cb.normalize();

                    normals[18 * k + 0] = cb.x;
                    normals[18 * k + 1] = cb.y;
                    normals[18 * k + 2] = cb.z;

                    normals[18 * k + 3] = cb.x;
                    normals[18 * k + 4] = cb.y;
                    normals[18 * k + 5] = cb.z;

                    normals[18 * k + 6] = cb.x;
                    normals[18 * k + 7] = cb.y;
                    normals[18 * k + 8] = cb.z;


                    // second traingle in cell
                    positions[18 * k + 9] = x + gridStep;
                    positions[18 * k + 10] = graphFunc(x + gridStep, z);
                    positions[18 * k + 11] = z;

                    positions[18 * k + 12] = x + gridStep;
                    positions[18 * k + 13] = graphFunc(x + gridStep, z + gridStep);
                    positions[18 * k + 14] = z + gridStep;

                    positions[18 * k + 15] = x;
                    positions[18 * k + 16] = graphFunc(x, z + gridStep);
                    positions[18 * k + 17] = z + gridStep;

                    pA.set(positions[18 * k + 9],
                        positions[18 * k + 10],
                        positions[18 * k + 11]);
                    pB.set(positions[18 * k + 12],
                        positions[18 * k + 13],
                        positions[18 * k + 14]);
                    pC.set(positions[18 * k + 15],
                        positions[18 * k + 16],
                        positions[18 * k + 17]);

                    cb.subVectors(pC, pB);
                    ab.subVectors(pA, pB);
                    cb.cross(ab);
                    cb.normalize();

                    normals[18 * k + 9] = cb.x;
                    normals[18 * k + 10] = cb.y;
                    normals[18 * k + 11] = cb.z;

                    normals[18 * k + 12] = cb.x;
                    normals[18 * k + 13] = cb.y;
                    normals[18 * k + 14] = cb.z;

                    normals[18 * k + 15] = cb.x;
                    normals[18 * k + 16] = cb.y;
                    normals[18 * k + 17] = cb.z;


                    k++;
                }
            }

            geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.addAttribute('normal', new THREE.BufferAttribute(normals, 3));

            material = new THREE.MeshNormalMaterial({
                side: THREE.DoubleSide,
                vertexColors: THREE.VertexColors
            });
            //geometry.computeBoundingBox();

            chunkMesh.add(new THREE.Mesh(geometry, material));
            return chunkMesh;
        }

        function _calcPosFunc(arg1, arg2, k, positions) {
            positions[k    ] = arg1;
            positions[k + 1] = graphFunc(arg1, arg2);
            positions[k + 2] = arg2;
        };

        function _simpleGrid(startPosition, type) {
            let chunkMesh = new THREE.Object3D(),
                material = new THREE.LineBasicMaterial({
                    color: options.lines.color,
                    linewidth: options.lines.width
                });

            let gridStep = options.gridStep;

            //Поменять местами, чтобы линии имели другое направление
            let versionOfCalcPos;
            if (type === 'xLines') {
                versionOfCalcPos = (x, z, k, positions) => _calcPosFunc.apply(null, [x, z, k, positions]);
            } else if (type === 'zLines') {
                versionOfCalcPos = (x, z, k, positions) => _calcPosFunc.apply(null, [z, x, k, positions]);
            }


            //Сетка по z
            for (let x = startPosition.x; x <= startPosition.x + cameraFar; x += gridStep) {
                let geometry = new THREE.BufferGeometry(),
                    positions = new Float32Array( Math.ceil(cameraFar / gridStep) * 3 + 3);

                let k = 0;
                for (let z = startPosition.z; z <= startPosition.z + cameraFar; z += gridStep) {
                    versionOfCalcPos(x, z, k, positions);
                    k += 3;
                }

                geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
                chunkMesh.add(new THREE.Line(geometry, material));
            }

            return chunkMesh;
        }

        return chooserStyle;
    }

    /**
     * Остановка цикла отрисовки
     */
    stopAnimate() {
        this.isDraw = false;
    }

    // Helpers

    //Копирование св-тв одного объекта в другой
    static deepParseOpt(sourseObj, donorObj) {
        let buildObj = {};

        for (let sourceKey in sourseObj) {
            if (typeof donorObj[sourceKey] === 'object' && typeof sourseObj[sourceKey] === 'object') {
                buildObj[sourceKey] = Graph.deepParseOpt(sourseObj[sourceKey], donorObj[sourceKey]);
            } else if (donorObj.hasOwnProperty(sourceKey)) {
                buildObj[sourceKey] = donorObj[sourceKey];
            } else {
                buildObj[sourceKey] = sourseObj[sourceKey];
            }
        }

        return buildObj;
    }

    /**
     * Нарисовать оси (добавить к сцене)
     */
    drawAxis() {
        var axisHelper = new THREE.AxisHelper(1000);
        this.scene.add(axisHelper);

        var size = 2 * this.globalOptions.cameraFar;
        var divisions = 10;

        var gridHelper = new THREE.GridHelper(size, divisions);
        //this.scene.add(gridHelper);
    }


    /**
     * Функция, меняющая параметры при изменении размера canvas
     */
    onWindowResize() { //Надо будет ещё протестировать
        this.camera.aspect = this.canvas.innerWidth / this.canvas.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.canvas.innerWidth, this.canvas.innerHeight);
    }

    get workspace() {
        return this.globalOptions;
    }

    static get defaultGraphProperties() {
        return {
            lines: {
                color: "#ff0000",
                width: 1,
                visible: true,
                gradientMode: false,
                gradientOpt: {
                    minimumColor: "#0000ff",
                    maximumColor: "#ff0000"
                }
            },
            dots: {
                color: "#000000",
                width: 2,
                visible: false,
                raycasterMode: true,
                hover: {
                    color: false,
                    weigth: false
                }
            },
            plates: {
                color: "#ff0000"
            },
            raycaster: {
                underlayment: "cccccc"
            },
            style: "grid", // "zLines", "xLines", "plates"
            gridStep: 50
        };
    }
}

