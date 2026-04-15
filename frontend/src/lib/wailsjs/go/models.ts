export namespace main {
	
	export class AppSettings {
	    defaultDownloadPath: string;
	    askBeforeDownload: boolean;
	    showFileDetails: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.defaultDownloadPath = source["defaultDownloadPath"];
	        this.askBeforeDownload = source["askBeforeDownload"];
	        this.showFileDetails = source["showFileDetails"];
	    }
	}
	export class Bucket {
	    name: string;
	    creationDate: string;
	
	    static createFrom(source: any = {}) {
	        return new Bucket(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.creationDate = source["creationDate"];
	    }
	}
	export class S3Object {
	    key: string;
	    name: string;
	    size: number;
	    lastModified: string;
	    isFolder: boolean;
	    etag: string;
	
	    static createFrom(source: any = {}) {
	        return new S3Object(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.name = source["name"];
	        this.size = source["size"];
	        this.lastModified = source["lastModified"];
	        this.isFolder = source["isFolder"];
	        this.etag = source["etag"];
	    }
	}
	export class ListObjectsResult {
	    objects: S3Object[];
	    nextContinuationToken: string;
	    hasMore: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ListObjectsResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.objects = this.convertValues(source["objects"], S3Object);
	        this.nextContinuationToken = source["nextContinuationToken"];
	        this.hasMore = source["hasMore"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class S3Config {
	    endpoint: string;
	    accessKey: string;
	    secretKey: string;
	    region: string;
	
	    static createFrom(source: any = {}) {
	        return new S3Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.endpoint = source["endpoint"];
	        this.accessKey = source["accessKey"];
	        this.secretKey = source["secretKey"];
	        this.region = source["region"];
	    }
	}

}

