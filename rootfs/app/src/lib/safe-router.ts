import express, { Request, Response, Router, RequestHandler, ErrorRequestHandler } from 'express';

// fallback next function
function log() {
  let args = [];
  for (let _i = 0; _i < arguments.length; _i++) {
    args[_i] = arguments[_i];
  }
  console.log('ERROR', 'No next function');
  console.log('arguments:', args);
}
// safe execute handle
function exec_handle(handle: RequestHandler|ErrorRequestHandler, ..._: any[]) {
  let args = [];
  for (let _i = 1; _i < arguments.length; _i++) {
    args[_i - 1] = arguments[_i];
  }
  let next = args && args[args.length - 1];
  let result: any;
  if (typeof next !== 'function') {
    next = log;
  }
  // execute handle
  result = handle.apply(void 0, args);
  // handle promise rejection
  if (result instanceof Promise) {
    return result.catch(function (err) {
      return next(err) && undefined;
    });
  }
  return result;
}
// handle decorator
function decorate_handle(handle: RequestHandler|ErrorRequestHandler) {
  let d_handle: RequestHandler|ErrorRequestHandler;
  if (handle.length < 4) {
    // standard request handle
    d_handle = function (req: Request, res: Response, next: RequestHandler) {
      return exec_handle(handle, req, res, next);
    };
  }
  else {
    // error request handle
    d_handle = function (err: any, req: Request, res: Response, next: RequestHandler) {
      return exec_handle(handle, err, req, res, next);
    };
  }
  // return decorated handle
  return d_handle;
}
function is_handle(handle: any) {
  return typeof handle === 'function';
}
function is_dispatch(layer: any) {
  return layer && layer.route &&
    layer.route.methods && layer.route.stack ? true : false;
}
function is_router(layer: any) {
  return layer && layer.handle &&
    layer.handle.stack ? true : false;
}
// stack.push decorator
function decorate_push(push: any, stack: any[]) {
  let d_push = function () {
    let items = [];
    for (let _i = 0; _i < arguments.length; _i++) {
      items[_i] = arguments[_i];
    }
    for (let i = 0; i < items.length; i++) {
      let layer = items[i];
      // ignore if not a valid handle
      if (!is_handle(layer.handle)) {
        continue;
      }
      // ignore if dispatch or router layer
      if (is_dispatch(layer) || is_router(layer)) {
        continue;
      }
      // decorate layer handler
      layer.handle = decorate_handle(layer.handle);
    }
    return push.apply(this, items);
  };
  // bind stack and return decorated push
  return d_push.bind(stack);
}
// router.route decorator
function decorate_route(route: any, router: Router) {
  let d_route = function () {
    let args = [];
    for (let _i = 0; _i < arguments.length; _i++) {
      args[_i] = arguments[_i];
    }
    let i_route = route.apply(this, args);
    // decorate push
    i_route.stack.push = decorate_push(i_route.stack.push, i_route.stack);
    // return safe route
    return i_route;
  };
  // bind router and return decorated route
  return d_route.bind(router);
}

export default (options?: any): Router => {
  if (!options) { options = { mergeParams: true } }
  let router = express.Router(options);
  // decorate route
  router.route = decorate_route(router.route, router);
  // decorate push
  router.stack.push = decorate_push(router.stack.push, router.stack);
  return router
}
